const Service = require('node-windows').Service;
const path = require('path');

// قم بإنشاء كائن خدمة بنفس الإعدادات
const svc = new Service({
    name: 'KayanSyncService',
    script: path.join(__dirname, 'server.js')
});

// استمع لحدث 'uninstall'
svc.on('uninstall', function () {
    console.log('Service uninstalled.');
});

// ابدأ عملية إلغاء تثبيت الخدمة
svc.uninstall();