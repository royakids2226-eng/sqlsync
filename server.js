const http = require('http');
const fs = require('fs');
const path = require('path');
const sql = require('mssql'); 
const { Pool } = require('pg'); 
const WebSocket = require('ws');

// --- إعدادات الاتصال ---
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const { db_config, table_name, sync_interval_ms, state_file, pg_connection_string } = config;

// التأكد من أن رابط PostgreSQL موجود
if (!pg_connection_string) {
    console.error("FATAL: 'pg_connection_string' is not defined in config.json. Exiting.");
    process.exit(1);
}

// إنشاء Pool الاتصال بـ PostgreSQL
const pgPool = new Pool({ 
    connectionString: pg_connection_string,
    connectionTimeoutMillis: 30000, // زيادة المهلة لـ 30 ثانية
    idleTimeoutMillis: 30000,
    max: 10 // تقليل عدد الاتصالات المتوازية لعدم خنق السيرفر
});
console.log('PostgreSQL connection pool configured with throttled settings.');

const appDataDir = path.join(process.env.PROGRAMDATA, 'KayanSyncService');
if (!fs.existsSync(appDataDir)) { fs.mkdirSync(appDataDir, { recursive: true }); }
const stateFilePath = path.join(appDataDir, state_file);

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) { res.writeHead(500); res.end('Error loading index.html'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else { res.writeHead(404); res.end(); }
});

const wss = new WebSocket.Server({ server });
let sqlPool;

let syncState = { lastSyncTime: '1970-01-01T00:00:00.000Z', isInitialSyncDone: false };

function loadSyncState() { 
    if (fs.existsSync(stateFilePath)) { 
        syncState = JSON.parse(fs.readFileSync(stateFilePath, 'utf8')); 
        console.log(`Sync state loaded from: ${stateFilePath}`); 
    } else { 
        console.log('No sync state file found. Starting fresh.'); 
    } 
}

function saveSyncState() { 
    try { 
        fs.writeFileSync(stateFilePath, JSON.stringify(syncState, null, 2)); 
    } catch (err) { 
        console.error(`CRITICAL: Failed to write sync state file at ${stateFilePath}.`, err); 
    } 
}

function broadcastEvent(action, payload) { 
    const message = JSON.stringify({ action, payload }); 
    wss.clients.forEach(client => { 
        if (client.readyState === WebSocket.OPEN) { client.send(message); } 
    }); 
}

wss.on('connection', ws => {
    console.log('Monitoring client connected.');
    broadcastEvent('info', { message: 'A new monitoring client has connected.' });
    ws.on('close', () => console.log('Monitoring client disconnected.'));
});

async function connectToSql() {
    try {
        if (sqlPool && sqlPool.connected) return sqlPool;
        console.log('Attempting to connect to SQL Server...');
        sqlPool = await new sql.ConnectionPool(db_config).connect();
        console.log('Successfully connected to SQL Server.');
        broadcastEvent('info', { message: 'تم الاتصال بقاعدة البيانات المصدر (SQL Server) بنجاح.' });
        sqlPool.on('error', err => { 
            console.error('SQL Pool Error:', err); 
            broadcastEvent('error', { message: 'حدث خطأ في الاتصال المستمر بـ SQL Server.', details: err.toString() }); 
        });
        return sqlPool;
    } catch (err) {
        console.error('DATABASE CONNECTION FAILED (SQL Server). Retrying...', err.code);
        broadcastEvent('error', { message: 'فشل الاتصال بـ SQL Server. سيتم إعادة المحاولة.', details: err.toString() });
        return null;
    }
}

// دالة مساعدة لعمل تأخير (Sleep)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- الدالة المحسنة لرفع البيانات (Throttled Batching) ---
async function upsertToPostgres(products) {
    if (!products || products.length === 0) return;

    // تم تقليل حجم الدفعة لتقليل الحمل على الرام والمعالج
    const BATCH_SIZE = 200; 
    const totalBatches = Math.ceil(products.length / BATCH_SIZE);
    
    console.log(`Preparing to sync ${products.length} items in ${totalBatches} batches (Throttled Mode)...`);
    
    const client = await pgPool.connect();
    
    try {
        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batch = products.slice(i, i + BATCH_SIZE);
            const currentBatchNum = Math.floor(i / BATCH_SIZE) + 1;

            const columns = Object.keys(batch[0]);
            
            // بناء القيم للـ Bulk Insert
            const valuesPlaceholders = batch.map((_, rowIndex) => 
                `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`
            ).join(', ');

            const updateSet = columns.map(col => `${col} = EXCLUDED.${col}`).join(', ');

            const queryText = `INSERT INTO products (${columns.join(', ')}) 
                               VALUES ${valuesPlaceholders} 
                               ON CONFLICT (unique_id) 
                               DO UPDATE SET ${updateSet}`;
            
            try {
                // تنفيذ الدفعة
                await client.query(queryText, batch.flatMap(p => Object.values(p)));
                
                // --- نقطة التحسين الجوهرية ---
                // ننتظر 200 مللي ثانية بين كل دفعة وأخرى
                // هذا يمنع "خنق" السيرفر ويسمح للموقع بالعمل أثناء المزامنة
                await delay(200); 

                if (currentBatchNum % 5 === 0 || currentBatchNum === totalBatches) {
                    console.log(`Synced batch ${currentBatchNum}/${totalBatches}...`);
                    broadcastEvent('info', { message: `جاري المزامنة: دفعة ${currentBatchNum} من ${totalBatches}` });
                }
            } catch (batchErr) {
                console.error(`Error in batch ${currentBatchNum}:`, batchErr);
                throw batchErr; 
            }
        }
    } finally {
        client.release();
    }
}

async function performInitialSync() {
    if (syncState.isInitialSyncDone) { return; }
    console.log('--- Starting ONE-TIME Initial Full Sync ---');
    broadcastEvent('sync_start', { type: 'Initial Full Sync', message: 'بدء المزامنة الكاملة (وضع آمن)...' });
    
    try {
        const pool = await connectToSql();
        if (!pool) throw new Error("Database not connected.");
        
        // جلب البيانات
        const result = await pool.request().query(`SELECT * FROM ${table_name}`);
        const products = result.recordset;
        
        console.log(`Found ${products.length} records. Starting Upload...`);
        
        await upsertToPostgres(products);

        syncState.isInitialSyncDone = true;
        syncState.lastSyncTime = new Date().toISOString();
        saveSyncState();
        
        console.log('--- Initial Full Sync Completed Successfully ---');
        broadcastEvent('sync_end', { type: 'Initial Full Sync', status: 'success', details: { synchronized: products.length } });
    } catch (err) {
        console.error('Error during initial sync:', err);
        broadcastEvent('sync_end', { type: 'Initial Full Sync', status: 'error', details: { error: err.toString() } });
    }
}

async function pollForChanges() {
    if (!syncState.isInitialSyncDone) { return; }
    try {
        const pool = await connectToSql();
        if (!pool) return;

        // جلب التغييرات
        const logResult = await pool.request().query(`SELECT LogID, type_id, stor_id, ChangeType FROM SyncChangesLog WHERE Processed = 0`);
        if (logResult.recordset.length === 0) return;

        const logs = logResult.recordset;
        
        // تصفية التكرار
        const itemsToProcess = new Map();
        for (const log of logs) { 
            const uniqueId = `${log.type_id}-${log.stor_id === null ? 'NULL' : log.stor_id}`; 
            if (!itemsToProcess.has(uniqueId) || log.ChangeType === 'DELETE') { 
                itemsToProcess.set(uniqueId, { type_id: log.type_id, stor_id: log.stor_id, changeType: log.ChangeType }); 
            } 
        }
        
        const updateLogs = []; 
        const deleteLogs = [];
        itemsToProcess.forEach(item => { 
            if (item.changeType === 'UPDATE') updateLogs.push(item); 
            else if (item.changeType === 'DELETE') deleteLogs.push(item); 
        });
        
        if (itemsToProcess.size === 0) return;
        
        broadcastEvent('sync_start', { type: 'Incremental Sync', message: `Processing changes...`, counts: { updates: updateLogs.length, deletions: deleteLogs.length } });
        
        const pgClient = await pgPool.connect();
        try {
            await pgClient.query('BEGIN'); 

            // معالجة الحذف
            if (deleteLogs.length > 0) {
                const deleteIds = deleteLogs.map(l => `${l.type_id}-${l.stor_id === null ? 'NULL' : l.stor_id}`);
                await pgClient.query('DELETE FROM products WHERE unique_id = ANY($1::varchar[])', [deleteIds]);
            }

            // معالجة التحديث
            if (updateLogs.length > 0) {
                for (const log of updateLogs) { 
                    await pool.request()
                        .input('type_id', sql.Int, log.type_id)
                        .input('stor_id', sql.Int, log.stor_id)
                        .execute('sp_RefreshMaterializedRow'); 
                }
                
                const uniqueIds = updateLogs.map(l => `'${l.type_id}-${l.stor_id === null ? 'NULL' : l.stor_id}'`);
                // ملاحظة: إذا كان عدد التحديثات ضخماً جداً، يفضل تقسيم الاستعلام هنا أيضاً
                const productResult = await pool.request().query(`SELECT * FROM ${table_name} WHERE unique_id IN (${uniqueIds.join(',')})`);
                
                await upsertToPostgres(productResult.recordset);
            }
            
            await pgClient.query('COMMIT');
        } catch (e) {
            await pgClient.query('ROLLBACK');
            throw e;
        } finally {
            pgClient.release();
        }

        // تحديث السجلات كمقروءة
        const logIdsToProcess = logs.map(l => l.LogID);
        const CHUNK_SIZE = 2000;
        for (let i = 0; i < logIdsToProcess.length; i += CHUNK_SIZE) {
             const chunk = logIdsToProcess.slice(i, i + CHUNK_SIZE);
             await pool.request().query(`UPDATE SyncChangesLog SET Processed = 1 WHERE LogID IN (${chunk.join(',')})`);
        }

        saveSyncState();
        broadcastEvent('sync_end', { type: 'Incremental Sync', status: 'success' });

    } catch (err) {
        console.error('[Sync] Error in polling:', err);
        broadcastEvent('sync_end', { type: 'Incremental Sync', status: 'error', details: { error: err.toString() } });
    }
}

async function start() {
    loadSyncState();
    let pool = await connectToSql();
    while (!pool) {
        console.log('Waiting 10 seconds before retrying database connection...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        pool = await connectToSql();
    }
    
    await performInitialSync();
    setInterval(pollForChanges, sync_interval_ms);
}

server.listen(3000, () => {
    console.log('Safe-Sync Server started on port 3000 (Protected Mode).');
    start();
});
