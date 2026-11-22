// ===== Global State =====
const state = {
    staged: null,
    records: [],
    errors: [],
    aggregated: [],
    chart: null,
    currentUser: null,
    activeTab: 'upload'
};

const TS_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
    startLiveClock();
    state.currentUser = await requireAuth();
    if (!state.currentUser) return;
    
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.textContent = state.currentUser.email;
    
    setupDropzone();
    loadHistory();
});

// ===== Live UTC Clock =====
function startLiveClock() {
    function updateClock() {
        const now = new Date();
        const p = n => String(n).padStart(2, '0');
        const str = `${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())} UTC`;
        const clockEl = document.getElementById('liveClock');
        if (clockEl) clockEl.textContent = str;
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// ===== Game Menu Navigation =====
function openModule(tabName) {
    document.getElementById('gameMenuHub').classList.add('hidden');
    document.getElementById('activeModuleView').classList.remove('hidden');
    switchTab(tabName);
}

function returnToMenu() {
    document.getElementById('activeModuleView').classList.add('hidden');
    document.getElementById('gameMenuHub').classList.remove('hidden');
}

function switchTab(name) {
    state.activeTab = name;
    ['upload', 'results', 'history'].forEach(s => {
        const tabContent = document.getElementById('tab-' + s);
        const pill = document.getElementById('pill-' + s);
        if (tabContent) tabContent.classList.toggle('hidden', s !== name);
        if (pill) pill.classList.toggle('active', s === name);
    });
    if (name === 'history') loadHistory();
}

// ===== Dropzone Setup =====
function setupDropzone() {
    const dz = document.getElementById('dropzone');
    const input = document.getElementById('fileInput');
    if (!dz || !input) return;

    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-active'); });
    dz.addEventListener('dragleave', e => { e.preventDefault(); dz.classList.remove('drag-active'); });
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drag-active');
        handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => {
        handleFile(input.files[0]);
        input.value = '';
    });
}

// ===== File Handling =====
function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
        return showToast('⚠️ Only .csv files are accepted.');
    }
    const reader = new FileReader();
    reader.onload = e => {
        stageCSV(file.name, file.size, e.target.result);
        showToast('✓ Ingested: ' + file.name);
    };
    reader.readAsText(file);
}

// ===== CSV Staging =====
function stageCSV(fileName, fileSize, raw) {
    try {
        const { headers, rows } = parseCSV(raw);
        state.staged = { fileName, fileSize, headers, rows };

        document.getElementById('dropzone').classList.add('hidden');
        document.getElementById('fileInfo').classList.remove('hidden');
        document.getElementById('fileName').textContent = fileName;
        document.getElementById('fileMeta').textContent =
            (fileSize / 1024).toFixed(1) + ' KB • ' + rows.length + ' RAW ROWS DETECTED';
        document.getElementById('mappingSection').classList.remove('hidden');

        // Preview table
        document.getElementById('previewHead').innerHTML =
            '<tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr>';
        document.getElementById('previewBody').innerHTML =
            rows.slice(0, 5).map(r =>
                '<tr>' + headers.map((_, i) => '<td>' + (r.cells[i] || '') + '</td>').join('') + '</tr>'
            ).join('');

        // Smart column mapping
        const tsSel = document.getElementById('tsColumn');
        const valSel = document.getElementById('valColumn');
        tsSel.innerHTML = '<option value="">-- Select Timestamp --</option>';
        valSel.innerHTML = '<option value="">-- Select Sensor Metric --</option>';

        let foundTs = false, foundVal = false;
        headers.forEach((h, i) => {
            const low = h.toLowerCase();
            const isTs = !foundTs && (low.includes('time') || low.includes('date') || low === 'ts');
            const isVal = !foundVal && (low.includes('val') || low.includes('temp') || low.includes('metric') || low.includes('vibe'));
            if (isTs) foundTs = true;
            if (isVal) foundVal = true;
            tsSel.add(new Option(h, i, false, isTs));
            valSel.add(new Option(h, i, false, isVal));
        });
        onMappingChange();
    } catch (err) {
        showToast('Parse error: ' + err.message);
    }
}

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV must have a header + at least 1 data row.');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map((line, i) => ({
        line: i + 2,
        cells: line.split(',').map(c => c.trim())
    }));
    return { headers, rows };
}

// ===== Column Mapping & Validation =====
function onMappingChange() {
    if (!state.staged) return;
    const tsIdx = document.getElementById('tsColumn').value;
    const valIdx = document.getElementById('valColumn').value;
    const msgBox = document.getElementById('validationMsg');

    if (tsIdx === '' || valIdx === '') {
        msgBox.classList.add('hidden');
        document.getElementById('processBtn').disabled = true;
        return;
    }
    if (tsIdx === valIdx) {
        msgBox.style.cssText = 'background:rgba(239,68,68,0.2);color:#fca5a5;padding:12px;border-radius:10px;margin-bottom:16px;border:1px solid rgba(239,68,68,0.4);font-size:13px';
        msgBox.textContent = '❌ Timestamp and Value columns must be distinct.';
        msgBox.classList.remove('hidden');
        document.getElementById('processBtn').disabled = true;
        return;
    }

    const result = validateRecords(state.staged.rows, +tsIdx, +valIdx);
    if (!result.valid.length) {
        msgBox.style.cssText = 'background:rgba(239,68,68,0.2);color:#fca5a5;padding:12px;border-radius:10px;margin-bottom:16px;border:1px solid rgba(239,68,68,0.4);font-size:13px';
        msgBox.textContent = '❌ 0 valid points found (' + result.errors.length + ' skipped).';
    } else {
        msgBox.style.cssText = 'background:rgba(52,211,153,0.15);color:#6ee7b7;padding:12px;border-radius:10px;margin-bottom:16px;border:1px solid rgba(52,211,153,0.3);font-size:13px';
        msgBox.textContent = `✓ Ingestion verified: ${result.valid.length} valid points (${result.errors.length} skipped outliers).`;
    }
    msgBox.classList.remove('hidden');
    document.getElementById('processBtn').disabled = !result.valid.length;
}

function validateRecords(rows, tsIdx, valIdx) {
    const valid = [], errors = [];
    for (const r of rows) {
        const rawTs = r.cells[tsIdx];
        const rawVal = r.cells[valIdx];
        const date = new Date(rawTs && !rawTs.includes('T') ? rawTs.replace(' ', 'T') : rawTs);
        const val = Number(rawVal);

        if (!rawTs || isNaN(date.getTime())) {
            errors.push('Row ' + r.line + ': Bad timestamp');
            continue;
        }
        if (rawVal === '' || rawVal === undefined || !Number.isFinite(val)) {
            errors.push('Row ' + r.line + ': Non-numeric');
            continue;
        }
        valid.push({ timestamp: date, value: val });
    }
    valid.sort((a, b) => a.timestamp - b.timestamp);
    valid.forEach((r, i) => r.record_id = i + 1);
    return { valid, errors };
}

// ===== Process Data =====
function processData() {
    if (!state.staged) return;
    const tsIdx = +document.getElementById('tsColumn').value;
    const valIdx = +document.getElementById('valColumn').value;
    const result = validateRecords(state.staged.rows, tsIdx, valIdx);

    if (!result.valid.length) return;
    state.records = result.valid;
    state.errors = result.errors;

    updateResults();
    switchTab('results');
    saveToSupabase();
    showToast(`✓ Telemetry Loaded: ${state.records.length} points`);
}

// ===== Aggregation =====
function aggregateRecords(records, interval) {
    const buckets = {}, order = [];
    for (const r of records) {
        const d = new Date(r.timestamp.getTime());
        d.setMinutes(Math.floor(d.getMinutes() / interval) * interval, 0, 0);
        const key = formatDate(d);
        if (!buckets[key]) { buckets[key] = []; order.push(key); }
        buckets[key].push(r.value);
    }
    return order.map((key, i) => {
        const vals = buckets[key];
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return {
            id: i + 1,
            bucket: key,
            avg: +avg.toFixed(2),
            min: +Math.min(...vals).toFixed(2),
            max: +Math.max(...vals).toFixed(2),
            count: vals.length
        };
    });
}

function calcStats(records) {
    if (!records.length) return { avg: 0, min: 0, max: 0, total: 0 };
    const vals = records.map(r => r.value);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
        avg: +avg.toFixed(2),
        min: +Math.min(...vals).toFixed(2),
        max: +Math.max(...vals).toFixed(2),
        total: vals.length
    };
}

// ===== Render Results =====
function updateResults() {
    const interval = +document.getElementById('intervalSelect').value;
    const agg = aggregateRecords(state.records, interval);
    state.aggregated = agg;

    const stats = calcStats(state.records);
    document.getElementById('statTotal').textContent = stats.total.toLocaleString();
    document.getElementById('statSkipped').textContent = state.errors.length + ' skipped outliers';
    document.getElementById('statAvg').textContent = stats.avg.toFixed(2);
    document.getElementById('statMin').textContent = stats.min.toFixed(2);
    document.getElementById('statMax').textContent = stats.max.toFixed(2);

    renderChart(agg);

    document.getElementById('resultBody').innerHTML = agg.map(r =>
        '<tr>' +
        '<td><span style="font-family:\'JetBrains Mono\',monospace;color:var(--accent-amber)">#' + r.id + '</span></td>' +
        '<td><strong style="color:var(--text-white)">' + r.bucket + '</strong></td>' +
        '<td><span style="color:var(--accent-cyan);font-weight:700">' + r.avg.toFixed(2) + '</span></td>' +
        '<td>' + r.min.toFixed(2) + '</td>' +
        '<td>' + r.max.toFixed(2) + '</td>' +
        '<td><span class="brand-tag" style="padding:2px 8px">' + r.count + ' pts</span></td>' +
        '</tr>'
    ).join('');
}

// ===== Glowing Chart.js Setup =====
function renderChart(agg) {
    if (state.chart) state.chart.destroy();
    const ctx = document.getElementById('chart').getContext('2d');
    
    // Gradient fill under the wave
    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: agg.map(r => r.bucket),
            datasets: [
                {
                    label: 'Downsampled Average',
                    data: agg.map(r => r.avg),
                    borderColor: '#38bdf8',
                    backgroundColor: gradient,
                    fill: true,
                    borderWidth: 3,
                    tension: 0.3,
                    pointBackgroundColor: '#38bdf8',
                    pointBorderColor: '#ffffff',
                    pointHoverRadius: 6,
                    pointRadius: 4
                },
                {
                    label: 'Maximum Bound',
                    data: agg.map(r => r.max),
                    borderColor: '#fbbf24',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    tension: 0.25,
                    pointRadius: 2,
                    fill: false
                },
                {
                    label: 'Minimum Bound',
                    data: agg.map(r => r.min),
                    borderColor: '#94a3b8',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    tension: 0.25,
                    pointRadius: 2,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#e2e8f0', font: { family: 'Plus Jakarta Sans', weight: '600' } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 26, 48, 0.95)',
                    titleColor: '#fbbf24',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 10
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' }
                }
            }
        }
    });
}

// ===== Supabase Cloud Persistence =====
async function saveToSupabase() {
    if (!state.currentUser || !state.records.length) return;
    const metric = document.getElementById('metricName').value || 'value';
    const records = state.records;
    const first = records[0], last = records[records.length - 1];

    const { error } = await window.supabaseClient.from('datasets').insert({
        user_id: state.currentUser.id,
        file_name: state.staged.fileName,
        metric_name: metric,
        total_records: records.length,
        start_time: formatDate(first.timestamp),
        end_time: formatDate(last.timestamp),
        raw_data: records.map(r => ({ ts: formatDate(r.timestamp), v: r.value })),
        aggregated_data: state.aggregated
    });

    if (error) {
        console.error('Supabase error:', error);
        showToast('⚠️ Cloud sync error.');
    } else {
        showToast('✓ Saved to Supabase Cloud Archive');
    }
}

// ===== Supabase Load History =====
async function loadHistory() {
    const tbody = document.getElementById('historyBody');
    const countEl = document.getElementById('historyCount');
    if (!tbody) return;

    const { data, error } = await window.supabaseClient
        .from('datasets')
        .select('*')
        .order('created_at', { ascending: false });

    if (countEl) countEl.textContent = (data ? data.length : 0) + ' MISSIONS';

    if (error || !data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:44px">No archived missions found. Upload your first dataset!</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(d =>
        '<tr>' +
        '<td><strong style="color:var(--text-white)">' + d.file_name + '</strong></td>' +
        '<td><span class="brand-tag">' + (d.metric_name || 'value') + '</span></td>' +
        '<td><span style="font-family:\'JetBrains Mono\',monospace;color:var(--accent-amber)">' + d.total_records.toLocaleString() + '</span></td>' +
        '<td style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--text-dim)">' + (d.start_time || '—') + ' → ' + (d.end_time || '—') + '</td>' +
        '<td style="font-size:12px;color:var(--text-dim)">' + new Date(d.created_at).toLocaleString() + '</td>' +
        '<td>' +
            '<button class="btn-glass-primary" style="padding:6px 14px;font-size:12px;margin-right:8px" onclick="viewDataset(\'' + d.id + '\')">Load</button>' +
            '<button class="btn-glass-logout" style="padding:6px 14px;font-size:12px" onclick="deleteDataset(\'' + d.id + '\')">Delete</button>' +
        '</td></tr>'
    ).join('');
}

// ===== View & Restore Dataset =====
async function viewDataset(id) {
    const { data, error } = await window.supabaseClient.from('datasets').select('*').eq('id', id).single();
    if (error || !data) return showToast('⚠️ Could not restore mission.');

    state.records = (data.raw_data || []).map((r, i) => ({
        record_id: i + 1,
        timestamp: new Date(r.ts.replace(' ', 'T')),
        value: r.v
    }));
    state.errors = [];
    state.staged = { fileName: data.file_name };

    updateResults();
    switchTab('results');
    showToast('✓ Restored Archive: ' + data.file_name);
}

// ===== Delete Dataset =====
async function deleteDataset(id) {
    if (!confirm('Permanently purge this mission from Supabase?')) return;
    const { error } = await window.supabaseClient.from('datasets').delete().eq('id', id);
    if (error) return showToast('⚠️ Delete failed.');
    showToast('✓ Mission purged.');
    loadHistory();
}

// ===== Export CSV =====
function exportCSV() {
    if (!state.aggregated.length) return showToast('⚠️ No data to export.');
    const csv = [
        'id,bucket_start,average,min,max,count',
        ...state.aggregated.map(r =>
            r.id + ',"' + r.bucket + '",' + r.avg + ',' + r.min + ',' + r.max + ',' + r.count
        )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'telemetry_aggregated.csv';
    a.click();
    showToast('✓ Telemetry CSV exported.');
}

// ===== Reset Upload =====
function resetUpload() {
    state.staged = null;
    state.records = [];
    state.errors = [];
    state.aggregated = [];
    document.getElementById('dropzone').classList.remove('hidden');
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('mappingSection').classList.add('hidden');
    switchTab('upload');
}

// ===== Utilities =====
function formatDate(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
           p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.style.display = 'none', 3500);
}
