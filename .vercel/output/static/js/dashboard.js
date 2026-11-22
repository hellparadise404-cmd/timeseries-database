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
    state.currentUser = await requireAuth();
    if (!state.currentUser) return;
    
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.textContent = state.currentUser.email;
    
    setupDropzone();
    loadHistory();
});

// ===== Navigation (Menu Hub & Module Selection) =====
function openModule(tabName) {
    document.getElementById('menuHub').classList.add('hidden');
    document.getElementById('activeModuleView').classList.remove('hidden');
    switchTab(tabName);
}

function returnToMenu() {
    document.getElementById('activeModuleView').classList.add('hidden');
    document.getElementById('menuHub').classList.remove('hidden');
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
        return showToast('Only CSV files (.csv) are supported.');
    }
    const reader = new FileReader();
    reader.onload = e => {
        stageCSV(file.name, file.size, e.target.result);
        showToast('Loaded ' + file.name);
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
            (fileSize / 1024).toFixed(1) + ' KB • ' + rows.length.toLocaleString() + ' rows';
        document.getElementById('mappingSection').classList.remove('hidden');

        // Preview table
        document.getElementById('previewHead').innerHTML =
            '<tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr>';
        document.getElementById('previewBody').innerHTML =
            rows.slice(0, 5).map(r =>
                '<tr>' + headers.map((_, i) => '<td>' + (r.cells[i] || '') + '</td>').join('') + '</tr>'
            ).join('');

        // Column select
        const tsSel = document.getElementById('tsColumn');
        const valSel = document.getElementById('valColumn');
        tsSel.innerHTML = '<option value="">Select Timestamp</option>';
        valSel.innerHTML = '<option value="">Select Metric Value</option>';

        let foundTs = false, foundVal = false;
        headers.forEach((h, i) => {
            const low = h.toLowerCase();
            const isTs = !foundTs && (low.includes('time') || low.includes('date') || low === 'ts');
            const isVal = !foundVal && (low.includes('val') || low.includes('temp') || low.includes('metric') || low.includes('sensor'));
            if (isTs) foundTs = true;
            if (isVal) foundVal = true;
            tsSel.add(new Option(h, i, false, isTs));
            valSel.add(new Option(h, i, false, isVal));
        });
        onMappingChange();
    } catch (err) {
        showToast(err.message);
    }
}

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV must contain a header row and at least one data row.');
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
        msgBox.className = 'validation-msg error';
        msgBox.textContent = 'Timestamp and Value columns must be different.';
        msgBox.classList.remove('hidden');
        document.getElementById('processBtn').disabled = true;
        return;
    }

    const result = validateRecords(state.staged.rows, +tsIdx, +valIdx);
    if (!result.valid.length) {
        msgBox.className = 'validation-msg error';
        msgBox.textContent = '0 valid records found (' + result.errors.length + ' skipped).';
    } else {
        msgBox.className = 'validation-msg success';
        msgBox.textContent = `${result.valid.length.toLocaleString()} valid records detected (${result.errors.length} skipped).`;
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
            errors.push('Row ' + r.line + ': Invalid timestamp');
            continue;
        }
        if (rawVal === '' || rawVal === undefined || !Number.isFinite(val)) {
            errors.push('Row ' + r.line + ': Non-numeric value');
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
    showToast('Processed ' + state.records.length.toLocaleString() + ' records.');
}

// ===== Aggregation =====
function aggregateRecords(records, intervalMin) {
    const buckets = {}, order = [];
    for (const r of records) {
        const d = new Date(r.timestamp.getTime());
        d.setMinutes(Math.floor(d.getMinutes() / intervalMin) * intervalMin, 0, 0);
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
    const intervalMin = +document.getElementById('intervalSelect').value;
    const agg = aggregateRecords(state.records, intervalMin);
    state.aggregated = agg;

    const stats = calcStats(state.records);
    document.getElementById('statTotal').textContent = stats.total.toLocaleString();
    document.getElementById('statSkipped').textContent = state.errors.length + ' skipped';
    document.getElementById('statAvg').textContent = stats.avg.toFixed(2);
    document.getElementById('statMin').textContent = stats.min.toFixed(2);
    document.getElementById('statMax').textContent = stats.max.toFixed(2);

    renderChart(agg);

    // Limit table display to first 100 rows for performance
    const displayRows = agg.slice(0, 100);
    document.getElementById('resultBody').innerHTML = displayRows.map(r =>
        '<tr>' +
        '<td class="mono">#' + r.id + '</td>' +
        '<td><strong>' + r.bucket + '</strong></td>' +
        '<td class="metric-val">' + r.avg.toFixed(2) + '</td>' +
        '<td>' + r.min.toFixed(2) + '</td>' +
        '<td>' + r.max.toFixed(2) + '</td>' +
        '<td><span class="badge">' + r.count + '</span></td>' +
        '</tr>'
    ).join('') + (agg.length > 100 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:14px">Showing first 100 of ${agg.length.toLocaleString()} buckets (use Export CSV for full dataset)</td></tr>` : '');
}

// ===== Professional Chart with Zoom & Pan Plugin =====
function renderChart(agg) {
    if (state.chart) state.chart.destroy();
    const ctx = document.getElementById('chart').getContext('2d');
    
    // Smooth subtle area fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 360);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    const hasVariation = agg.some(r => r.max !== r.min);

    const datasets = [
        {
            label: 'Average Value',
            data: agg.map(r => r.avg),
            borderColor: '#38bdf8',
            backgroundColor: gradient,
            fill: true,
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 0,              // Prevents solid white blob
            pointHoverRadius: 6,         // Visible on hover
            pointHoverBackgroundColor: '#38bdf8',
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2
        }
    ];

    if (hasVariation) {
        datasets.push(
            {
                label: 'Max Peak',
                data: agg.map(r => r.max),
                borderColor: '#fbbf24',
                borderDash: [4, 4],
                borderWidth: 1.5,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false
            },
            {
                label: 'Min Floor',
                data: agg.map(r => r.min),
                borderColor: '#94a3b8',
                borderDash: [4, 4],
                borderWidth: 1.5,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false
            }
        );
    }

    const labels = agg.map(r => {
        const parts = r.bucket.split(' ');
        return parts.length === 2 ? parts[0] + ' ' + parts[1].slice(0, 5) : r.bucket;
    });

    state.chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#cbd5e1',
                        font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
                        boxWidth: 16,
                        boxHeight: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 18, 34, 0.95)',
                    titleColor: '#fbbf24',
                    titleFont: { family: 'JetBrains Mono', size: 12 },
                    bodyColor: '#f1f5f9',
                    bodyFont: { family: 'Plus Jakarta Sans', size: 13 },
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8
                },
                // Zoom & Pan Configuration
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        threshold: 5
                    },
                    zoom: {
                        wheel: {
                            enabled: true,
                            speed: 0.08
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'x'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'JetBrains Mono', size: 11 },
                        maxTicksLimit: 12,
                        maxRotation: 0,
                        autoSkip: true
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'JetBrains Mono', size: 11 }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)'
                    }
                }
            }
        }
    });
}

// ===== Zoom & Pan Control Functions =====
function zoomIn() {
    if (state.chart) {
        state.chart.zoom(1.3);
        clearActivePreset();
    }
}

function zoomOut() {
    if (state.chart) {
        state.chart.zoom(0.77);
        clearActivePreset();
    }
}

function resetZoom() {
    if (state.chart) {
        state.chart.resetZoom();
        setActivePreset('all');
    }
}

function setWindowPreset(days) {
    if (!state.chart || !state.aggregated.length) return;
    
    // First reset zoom so index calculations are clean
    state.chart.resetZoom();
    setActivePreset(days);

    if (days === 'all') return;

    const totalBuckets = state.aggregated.length;
    const intervalMin = +document.getElementById('intervalSelect').value || 60;
    
    // Calculate how many points correspond to the requested number of days
    const bucketsForDays = Math.round((days * 24 * 60) / intervalMin);
    
    if (bucketsForDays >= totalBuckets) return; // Already fits completely

    // Show the most recent `days` period with generous spacing
    const minIndex = Math.max(0, totalBuckets - bucketsForDays);
    const maxIndex = totalBuckets - 1;

    // Apply zoom on x scale
    if (typeof state.chart.zoomScale === 'function') {
        state.chart.zoomScale('x', { min: minIndex, max: maxIndex }, 'default');
    } else {
        const factor = totalBuckets / bucketsForDays;
        state.chart.zoom(factor);
    }
}

function setActivePreset(days) {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (days === 'all') {
        const allBtn = document.getElementById('btnPresetAll');
        if (allBtn) allBtn.classList.add('active');
    } else {
        const matchingBtn = Array.from(document.querySelectorAll('.preset-btn')).find(
            b => b.textContent.includes(String(days))
        );
        if (matchingBtn) matchingBtn.classList.add('active');
    }
}

function clearActivePreset() {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
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
        showToast('Database sync warning.');
    } else {
        showToast('Saved to database.');
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

    if (countEl) countEl.textContent = (data ? data.length : 0) + ' datasets';

    if (error || !data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:44px">No datasets found in history.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(d =>
        '<tr>' +
        '<td><strong style="color:var(--text-white)">' + d.file_name + '</strong></td>' +
        '<td><span class="badge">' + (d.metric_name || 'value') + '</span></td>' +
        '<td class="mono">' + d.total_records.toLocaleString() + '</td>' +
        '<td class="mono-dim">' + (d.start_time || '—') + ' → ' + (d.end_time || '—') + '</td>' +
        '<td class="mono-dim">' + new Date(d.created_at).toLocaleString() + '</td>' +
        '<td>' +
            '<button class="btn-glass-primary sm" onclick="viewDataset(\'' + d.id + '\')">View</button> ' +
            '<button class="btn-glass-danger sm" onclick="deleteDataset(\'' + d.id + '\')">Delete</button>' +
        '</td></tr>'
    ).join('');
}

// ===== View & Restore Dataset =====
async function viewDataset(id) {
    const { data, error } = await window.supabaseClient.from('datasets').select('*').eq('id', id).single();
    if (error || !data) return showToast('Could not load dataset.');

    state.records = (data.raw_data || []).map((r, i) => ({
        record_id: i + 1,
        timestamp: new Date(r.ts.replace(' ', 'T')),
        value: r.v
    }));
    state.errors = [];
    state.staged = { fileName: data.file_name };

    updateResults();
    switchTab('results');
    showToast('Loaded ' + data.file_name);
}

// ===== Delete Dataset =====
async function deleteDataset(id) {
    if (!confirm('Permanently delete this dataset from history?')) return;
    const { error } = await window.supabaseClient.from('datasets').delete().eq('id', id);
    if (error) return showToast('Delete failed.');
    showToast('Deleted dataset.');
    loadHistory();
}

// ===== Export CSV =====
function exportCSV() {
    if (!state.aggregated.length) return showToast('No data to export.');
    const csv = [
        'id,bucket_start,average,min,max,count',
        ...state.aggregated.map(r =>
            r.id + ',"' + r.bucket + '",' + r.avg + ',' + r.min + ',' + r.max + ',' + r.count
        )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aggregated_results.csv';
    a.click();
    showToast('Exported aggregated CSV.');
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
    toastTimer = setTimeout(() => t.style.display = 'none', 3000);
}
