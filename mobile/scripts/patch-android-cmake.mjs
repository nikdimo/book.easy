import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = fileURLToPath(new URL("..", import.meta.url));

const patches = [
  {
    name: "react-native-worklets",
    file: path.join(
      mobileRoot,
      "node_modules",
      "react-native-worklets",
      "android",
      "CMakeLists.txt",
    ),
    before: "target_link_libraries(worklets android log ReactAndroid::reactnative",
    after: "target_link_libraries(worklets c++_shared android log ReactAndroid::reactnative",
  },
  {
    name: "react-native-reanimated",
    file: path.join(
      mobileRoot,
      "node_modules",
      "react-native-reanimated",
      "android",
      "CMakeLists.txt",
    ),
    before: "target_link_libraries(\n  reanimated\n  log",
    after: "target_link_libraries(\n  reanimated\n  c++_shared\n  log",
  },
  {
    name: "react-native-screens library",
    file: path.join(
      mobileRoot,
      "node_modules",
      "react-native-screens",
      "android",
      "CMakeLists.txt",
    ),
    before: "target_link_libraries(rnscreens\n    ReactAndroid::reactnative",
    after: "target_link_libraries(rnscreens\n    c++_shared\n    ReactAndroid::reactnative",
  },
  {
    name: "react-native-screens codegen",
    file: path.join(
      mobileRoot,
      "node_modules",
      "react-native-screens",
      "android",
      "src",
      "main",
      "jni",
      "CMakeLists.txt",
    ),
    before: "target_link_libraries(\n  ${LIB_TARGET_NAME}\n  ReactAndroid::reactnative",
    after: "target_link_libraries(\n  ${LIB_TARGET_NAME}\n  c++_shared\n  ReactAndroid::reactnative",
  },
  {
    name: "react-native-gesture-handler",
    file: path.join(
      mobileRoot,
      "node_modules",
      "react-native-gesture-handler",
      "android",
      "src",
      "main",
      "jni",
      "CMakeLists.txt",
    ),
    before: "target_link_libraries(\n  ${PACKAGE_NAME}\n  ReactAndroid::reactnative",
    after: "target_link_libraries(\n  ${PACKAGE_NAME}\n  c++_shared\n  ReactAndroid::reactnative",
  },
  {
    name: "react-native-safe-area-context",
    file: path.join(
      mobileRoot,
      "node_modules",
      "react-native-safe-area-context",
      "android",
      "src",
      "main",
      "jni",
      "CMakeLists.txt",
    ),
    before: "          ${LIB_TARGET_NAME}\n          fbjni",
    after: "          ${LIB_TARGET_NAME}\n          c++_shared\n          fbjni",
    replaceAll: true,
  },
  {
    name: "expo-modules-core",
    file: path.join(
      mobileRoot,
      "node_modules",
      "expo-modules-core",
      "android",
      "cmake",
      "main.cmake",
    ),
    before: "  expo-modules-core\n  PRIVATE\n  ${LOG_LIB}",
    after: "  expo-modules-core\n  PRIVATE\n  c++_shared\n  ${LOG_LIB}",
  },
  {
    name: "React Native app target",
    file: path.join(
      mobileRoot,
      "node_modules",
      "react-native",
      "ReactAndroid",
      "cmake-utils",
      "ReactNative-application.cmake",
    ),
    before: "target_link_libraries(${CMAKE_PROJECT_NAME}\n        fbjni",
    after: "target_link_libraries(${CMAKE_PROJECT_NAME}\n        c++_shared\n        fbjni",
  },
];

for (const patch of patches) {
  const source = await readFile(patch.file, "utf8");
  if (source.includes(patch.after)) {
    console.log(`${patch.name}: explicit c++_shared link already present.`);
    continue;
  }
  if (!source.includes(patch.before)) {
    throw new Error(
      `${patch.name}: expected CMake content was not found; refusing an unsafe patch.`,
    );
  }
  const updated = patch.replaceAll
    ? source.replaceAll(patch.before, patch.after)
    : source.replace(patch.before, patch.after);
  await writeFile(patch.file, updated, "utf8");
  console.log(`${patch.name}: added explicit c++_shared link for Android NDK 27.`);
}
