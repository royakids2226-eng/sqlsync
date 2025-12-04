const JavaScriptObfuscator = require("javascript-obfuscator");
const fs = require("fs-extra"); // سنحتاج لمكتبة إضافية لسهولة نسخ الملفات
const path = require("path");

// --- الإعدادات ---
const sourceDir = __dirname;
const outputDir = path.join(__dirname, "dist");
const filesToObfuscate = [
  "server.js",
  "install-service.js",
  "uninstall-service.js",
];
const filesToCopy = [
  "package.json",
  "package-lock.json",
  "index.html",
  "create_config.ps1",
  "setup_tasks.bat",
  "uninstall_tasks.bat",
];

// إعدادات التعتيم (مستوى متوسط من الحماية)
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: "function",
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

async function build() {
  console.log("Starting build process...");

  // 1. تنظيف مجلد dist القديم وإنشائه من جديد
  console.log(`Cleaning and creating output directory: ${outputDir}`);
  await fs.emptyDir(outputDir);

  // 2. تعتيم ونسخ ملفات الجافاسكريبت
  console.log("Obfuscating JavaScript files...");
  for (const fileName of filesToObfuscate) {
    const filePath = path.join(sourceDir, fileName);
    const outputPath = path.join(outputDir, fileName);
    const sourceCode = await fs.readFile(filePath, "utf8");
    const obfuscationResult = JavaScriptObfuscator.obfuscate(
      sourceCode,
      obfuscationOptions
    );
    await fs.writeFile(outputPath, obfuscationResult.getObfuscatedCode());
    console.log(`  - ${fileName} -> obfuscated`);
  }

  // 3. نسخ باقي الملفات المطلوبة كما هي
  console.log("Copying other necessary files...");
  for (const fileName of filesToCopy) {
    const filePath = path.join(sourceDir, fileName);
    const outputPath = path.join(outputDir, fileName);
    await fs.copy(filePath, outputPath);
    console.log(`  - ${fileName} -> copied`);
  }

  console.log("\nBuild completed successfully!");
  console.log(`Output is ready in: ${outputDir}`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
