import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mobileRoot = fileURLToPath(new URL("..", import.meta.url));
const androidRoot = path.join(mobileRoot, "android");
const logsRoot = path.join(mobileRoot, "build-logs");
const requiredNdk = "27.1.12297006";
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const logPath = path.join(logsRoot, `android-debug-${stamp}.log`);

await mkdir(logsRoot, { recursive: true });
const log = createWriteStream(logPath, { flags: "a" });

function write(message = "") {
  const line = `${message}${os.EOL}`;
  process.stdout.write(line);
  log.write(line);
}

function run(command, args, cwd = mobileRoot) {
  write(`> ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || "development",
      },
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      log.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      log.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function androidSdkRoot() {
  return (
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk")
  );
}

async function validateToolchain() {
  const ndkRoot = path.join(androidSdkRoot(), "ndk", requiredNdk);
  if (!existsSync(ndkRoot)) {
    throw new Error(
      `Android NDK ${requiredNdk} is required by Expo SDK 57 / React Native 0.86. ` +
        `Install it in Android Studio (SDK Manager > SDK Tools > Show Package Details).`,
    );
  }
  write(`Using Android NDK ${requiredNdk}: ${ndkRoot}`);
}

async function stopGradle() {
  const wrapperJar = path.join(androidRoot, "gradle", "wrapper", "gradle-wrapper.jar");
  if (existsSync(wrapperJar)) {
    write("Stopping Gradle daemons before deleting generated files...");
    await run(
      "java",
      ["-classpath", wrapperJar, "org.gradle.wrapper.GradleWrapperMain", "--stop"],
      androidRoot,
    );
  }
}

async function configureGradleMemory() {
  const propertiesPath = path.join(androidRoot, "gradle.properties");
  const appBuildGradlePath = path.join(androidRoot, "app", "build.gradle");
  const source = await readFile(propertiesPath, "utf8");
  const memory = "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m";
  let updated = /^org\.gradle\.jvmargs=.*$/m.test(source)
    ? source.replace(/^org\.gradle\.jvmargs=.*$/m, memory)
    : `${source.trimEnd()}${os.EOL}${memory}${os.EOL}`;
  updated = /^reactNativeArchitectures=.*$/m.test(updated)
    ? updated.replace(/^reactNativeArchitectures=.*$/m, "reactNativeArchitectures=arm64-v8a")
    : `${updated.trimEnd()}${os.EOL}reactNativeArchitectures=arm64-v8a${os.EOL}`;
  await writeFile(propertiesPath, updated, "utf8");
  const appBuildGradle = await readFile(appBuildGradlePath, "utf8");
  const bundleMarker = '    // debuggableVariants = ["liteDebug", "prodDebug"]';
  if (!appBuildGradle.includes("debuggableVariants = []")) {
    if (!appBuildGradle.includes(bundleMarker)) {
      throw new Error(
        "Generated app/build.gradle no longer contains the expected debuggableVariants setting.",
      );
    }
    await writeFile(
      appBuildGradlePath,
      appBuildGradle.replace(
        bundleMarker,
        "    // Bundle JavaScript into the debug APK so it runs without Metro on a physical phone.\n" +
          "    debuggableVariants = []",
      ),
      "utf8",
    );
  }
  write("Configured Gradle with 4 GiB heap and 1 GiB metaspace.");
  write("Configured the local debug APK for arm64-v8a Android phones.");
  write("Configured the debug APK to include the JavaScript bundle for standalone phone testing.");
}

async function cleanAndGenerate(attempt) {
  write();
  write(`=== Android build attempt ${attempt}/2 ===`);
  await stopGradle();
  write(`Deleting the complete generated folder: ${androidRoot}`);
  await rm(androidRoot, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  });
  const nativeClean = await run("node", ["scripts/clean-native-builds.mjs"]);
  if (nativeClean !== 0) return nativeClean;
  const prebuild = await run(
    "node",
    [path.join(mobileRoot, "node_modules", "expo", "bin", "cli"), "prebuild", "--platform", "android"],
  );
  if (prebuild !== 0) return prebuild;
  await configureGradleMemory();
  const wrapperJar = path.join(androidRoot, "gradle", "wrapper", "gradle-wrapper.jar");
  return run(
    "java",
    [
      "-classpath",
      wrapperJar,
      "org.gradle.wrapper.GradleWrapperMain",
      "assembleDebug",
      "--no-daemon",
      "--stacktrace",
      "--console=plain",
    ],
    androidRoot,
  );
}

try {
  write(`Android debug build log: ${logPath}`);
  await validateToolchain();
  const cmakePatch = await run("node", ["scripts/patch-android-cmake.mjs"]);
  if (cmakePatch !== 0) {
    throw new Error("Could not apply the Android NDK 27 CMake compatibility patch.");
  }

  let exitCode = await cleanAndGenerate(1);
  if (exitCode !== 0) {
    write();
    write("First build failed. Performing the promised full deletion and clean retry...");
    exitCode = await cleanAndGenerate(2);
  }

  if (exitCode !== 0) {
    throw new Error(`Android build failed twice. Full diagnostics are in ${logPath}`);
  }

  const apkPath = path.join(androidRoot, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!existsSync(apkPath)) {
    throw new Error(`Gradle succeeded but the APK was not found at ${apkPath}`);
  }
  write();
  write("BUILD SUCCESSFUL");
  write(`APK: ${apkPath}`);
  write(`Log: ${logPath}`);
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  write();
  write(`FATAL: ${message}`);
  process.exitCode = 1;
} finally {
  log.end();
}
