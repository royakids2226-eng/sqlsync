const Service = require('node-windows').Service;
const path = require('path');

// قم بإنشاء كائن خدمة جديد مع الإعدادات الكاملة
const svc = new Service({
    name: 'KayanSyncService',
    description: 'خدمة مزامنة البيانات بين SQL Server و Google Sheets لتطبيق كيان.',
    script: path.join(__dirname, 'server.js'),
    
    // *** الحل النهائي والحاسم: تحديد المسار الكامل لـ node.exe ***
    // هذا يخبر الخدمة بمكان وجود Node.js بالضبط، متجاوزاً أي مشاكل في متغيرات البيئة (PATH).
    // process.execPath هو متغير خاص في Node.js يحتوي دائماً على المسار الكامل للملف التنفيذي لـ node.
    execPath: process.execPath,

    // الإعدادات السابقة التي تضمن العثور على الملفات والبدء بعد SQL Server
    workingDirectory: __dirname,
    dependencies: ['MSSQL$SQLEXPRESS'],

    nodeOptions: [
        '--harmony',
        '--max_old_space_size=4096'
    ],
    
    // -- إعدادات إضافية لتسجيل الأخطاء بشكل أفضل (Plan B) --
    // سيتم إنشاء مجلد 'logs' داخل مجلد التثبيت يحتوي على أي أخطاء أو مخرجات.
    logpath: path.join(__dirname, 'logs'),
    errorpath: path.join(__dirname, 'logs'),
    outfile: path.join(__dirname, 'logs', 'service.log'),
    errorfile: path.join(__dirname, 'logs', 'service-error.log')
});

// استمع لحدث 'install'
svc.on('install', function () {
    console.log('Service installed with FULL node path, working directory, and dependencies.');
    console.log('Starting service...');
    svc.start();
    console.log('Service started.');
});

// استمع لحدث 'alreadyinstalled' للتعامل مع إعادة التثبيت أو التحديث
svc.on('alreadyinstalled', function() {
    console.log('Service is already installed. Restarting it to apply changes...');
    svc.restart();
});

// ابدأ عملية تثبيت الخدمة
svc.install();