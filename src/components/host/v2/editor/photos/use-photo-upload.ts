"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ListingMediaTypeValue } from "@/lib/types/listing-media";

/**
 * The upload queue behind "Upload photos".
 *
 * Deliberately not a wizard. Files go up in the background, each tile appears in the grid
 * the moment its own upload lands, and nothing asks the host to classify anything — the
 * organising model is upload first, sort later, and a fifty-photo batch is the normal
 * case rather than the extreme one.
 */
const MAX_PARALLEL = 3;

export type UploadStatus = "queued" | "uploading" | "processing" | "error";

export interface UploadTask {
  id: string;
  name: string;
  previewUrl: string;
  mediaType: ListingMediaTypeValue;
  progress: number;
  status: UploadStatus;
  error?: string;
}

interface UploadResponse {
  error?: string;
  url?: string;
  mediaType?: string;
}

function fileMediaType(file: File): ListingMediaTypeValue {
  return file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name)
    ? "VIDEO"
    : "IMAGE";
}

function errorMessage(status: number, data: UploadResponse): string {
  if (status === 413) return "That file is too large. The limit is 50 MB.";
  return data.error || `Upload failed (${status})`;
}

function putFile(
  file: File,
  onProgress: (progress: number) => void,
  onProcessing: () => void,
): Promise<{ url: string; mediaType: ListingMediaTypeValue }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.set("file", file);

    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.upload.onload = onProcessing;
    xhr.onerror = () => reject(new Error("Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.onload = () => {
      let data: UploadResponse = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        // A reverse proxy can answer with an HTML error page, notably for HTTP 413.
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(errorMessage(xhr.status, data)));
        return;
      }
      if (data.url && (data.mediaType === "IMAGE" || data.mediaType === "VIDEO")) {
        resolve({ url: data.url, mediaType: data.mediaType });
        return;
      }
      reject(new Error("The server returned an invalid upload response."));
    };
    xhr.send(body);
  });
}

export function usePhotoUpload({
  onUploaded,
}: {
  /** Called per finished file, so a photo reaches the grid as soon as it lands rather
   *  than when the slowest file in the batch does. */
  onUploaded: (item: { url: string; mediaType: ListingMediaTypeValue }) => Promise<void>;
}) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const previewUrls = useRef(new Set<string>());
  // Held in a ref so a re-render of the workspace does not tear down and restart an
  // upload queue that is halfway through a fifty-file batch. Written in an effect rather
  // than during render, which React treats as a side effect on a value it does not track.
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const update = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );
  }, []);

  const release = useCallback((url: string) => {
    // Deferred a frame: revoking while the tile that renders it is still mounted paints
    // a broken image for the frame between the swap and the unmount.
    window.requestAnimationFrame(() => {
      URL.revokeObjectURL(url);
      previewUrls.current.delete(url);
    });
  }, []);

  const runTask = useCallback(
    async (task: UploadTask, file: File) => {
      update(task.id, { status: "uploading", progress: 0, error: undefined });
      try {
        const uploaded = await putFile(
          file,
          (progress) => update(task.id, { progress }),
          () => update(task.id, { status: "processing", progress: 100 }),
        );
        await onUploadedRef.current(uploaded);
        setTasks((current) => current.filter((row) => row.id !== task.id));
        release(task.previewUrl);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload failed. Try again.";
        update(task.id, { status: "error", error: message });
        toast.error(`${task.name}: ${message}`);
      }
    },
    [release, update],
  );

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const chosen = Array.from(files);
      if (chosen.length === 0) return;

      const queued = chosen.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        previewUrls.current.add(previewUrl);
        return {
          task: {
            id: crypto.randomUUID(),
            name: file.name,
            previewUrl,
            mediaType: fileMediaType(file),
            progress: 0,
            status: "queued" as const,
          },
          file,
        };
      });

      setTasks((current) => [...current, ...queued.map((entry) => entry.task)]);

      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(MAX_PARALLEL, queued.length) }, async () => {
          while (next < queued.length) {
            const entry = queued[next];
            next += 1;
            await runTask(entry.task, entry.file);
          }
        }),
      );
    },
    [runTask],
  );

  const dismiss = useCallback(
    (id: string) => {
      setTasks((current) => {
        const task = current.find((row) => row.id === id);
        if (task) release(task.previewUrl);
        return current.filter((row) => row.id !== id);
      });
    },
    [release],
  );

  const active = tasks.filter((task) => task.status !== "error");

  return {
    tasks,
    upload,
    dismiss,
    uploading: active.length > 0,
    activeCount: active.length,
  };
}
