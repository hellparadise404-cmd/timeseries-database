// ===== Global State =====
const state = {
    staged: null,
    records: [],
    errors: [],
    aggregated: [],
    chart: null,
    currentUser: null
};

const TS_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
    state.currentUser = await requireAuth();
    if (!state.currentUser) return;
    document.getElementById('userEmail').textContent = state.currentUser.email;
    setupDropzone();
    loadHistory();
});

// ===== Section Navigation =====
function showSection(name) {
    ['upload', 'results', 'history'].forEach(s => {
        const el = document.getElementById('section-' + s);
        if (el) el.classList.toggle('hidden', s !== name);
    });
    document.querySelectorAll('.sidebar nav a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#' + name);
    });
    const titles = { upload: 'Upload CSV', results: 'Results & Visualization', history: 'Upload History' };
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = titles[name] || '';
    if (name === 'history') loadHistory();
}

// ===== Dropzone Setup =====
function setupDropzone() {
    const dz = document.getElementById('dropzone');
    const input = document.getElementById('fileInput');

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
        return showToast('Only .csv files are accepted.');
    }
    const reader = new FileReader();
    reader.onload = e => {
        stageCSV(file.name, file.size, e.target.result);
        showToast('Loaded: ' + file.name);
    };
    reader.readAsText(file);
}

// ===== CSV Staging (parse + preview) =====
function stageCSV(fileName, fileSize, raw) {
    try {
        const { headers, rows } = parseCSV(raw);
        state.staged = { fileName, fileSize, headers, rows };

        // Toggle UI
        document.getElementById('dropzone').classList.add('hidden');
        document.getElementById('fileInfo').classList.remove('hidden');
        document.getElementById('fileName').textContent = fileName;
        document.getElementById('fileMeta').textContent =
            (fileSize / 1024).toFixed(1) + ' KB • ' + rows.length + ' rows';
        document.getElementById('mappingSection').classList.remove('hidden');

        // Preview table (first 5 rows)
        document.getElementById('previewHead').innerHTML =
            '<tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr>';
        document.getElementById('previewBody').innerHTML =
            rows.slice(0, 5).map(r =>
                '<tr>' + headers.map((_, i) => '<td>' + (r.cells[i] || '') + '</td>').join('') + '</tr>'
            ).join('');

        // Auto-detect columns
        const tsSel = document.getElementById('tsColumn');
        const valSel = document.getElementById('valColumn');
        tsSel.innerHTML = '<option value="">-- Timestamp --</option>';
        valSel.innerHTML = '<option value="">-- Value --</option>';

        let foundTs = false, foundVal = false;
        headers.forEach((h, i) => {
            const low = h.toLowerCase();
            const isTs = !foundTs && (low.includes('time') || low.includes('date') || low === 'ts');
            const isVal = !foundVal && (low.includes('val') || low.includes('temp') || low.includes('metric'));
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
        msgBox.className = 'validation-msg error';
        msgBox.textContent = 'Timestamp and Value must be different columns.';
        msgBox.classList.remove('hidden');
        document.getElementById('processBtn').disabled = true;
        return;
    }

    const result = validateRecords(state.staged.rows, +tsIdx, +valIdx);
    if (!result.valid.length) {
        msgBox.className = 'validation-msg error';
        msgBox.textContent = '0 valid records (' + result.errors.length + ' skipped).';
    } else {
        const type = result.errors.length ? 'warning' : 'success';
        msgBox.className = 'validation-msg ' + type;
        msgBox.textContent = result.valid.length + ' valid • ' + result.errors.length + ' skipped';
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
    showSection('results');
    saveToSupabase();
    showToast('Processed ' + state.records.length + ' records');
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

    // Update stats cards
    const stats = calcStats(state.records);
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statSkipped').textContent = state.errors.length + ' skipped';
    document.getElementById('statAvg').textContent = stats.avg.toFixed(2);
    document.getElementById('statMin').textContent = stats.min.toFixed(2);
    document.getElementById('statMax').textContent = stats.max.toFixed(2);

    // Render chart
    renderChart(agg);

    // Render table
    document.getElementById('resultBody').innerHTML = agg.map(r =>
        '<tr><td>' + r.id + '</td><td><strong>' + r.bucket + '</strong></td><td>' +
        r.avg.toFixed(2) + '</td><td>' + r.min.toFixed(2) + '</td><td>' +
        r.max.toFixed(2) + '</td><td>' + r.count + '</td></tr>'
    ).join('');
}

// ===== Chart =====
function renderChart(agg) {
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(document.getElementById('chart'), {
        type: 'line',
        data: {
            labels: agg.map(r => r.bucket),
            datasets: [
                {
                    label: 'Average',
                    data: agg.map(r => r.avg),
                    borderColor: '#2d3a8c',
                    backgroundColor: 'rgba(45,58,140,0.08)',
                    fill: true,
                    borderWidth: 2.5,
                    tension: 0.25,
                    pointBackgroundColor: '#2d3a8c'
                },
                {
                    label: 'Max',
                    data: agg.map(r => r.max),
                    borderColor: '#22c55e',
                    borderDash: [5, 5],
                    borderWidth: 1.5,
                    tension: 0.2,
                    pointRadius: 2
                },
                {
                    label: 'Min',
                    data: agg.map(r => r.min),
                    borderColor: '#94a3b8',
                    borderDash: [5, 5],
                    borderWidth: 1.5,
                    tension: 0.2,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: '#e5e7eb' } }
            }
        }
    });
}

// ===== Supabase: Save =====
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
        console.error('Save error:', error);
        showToast('Failed to save to database.');
    } else {
        showToast('Saved to database!');
    }
}

// ===== Supabase: Load History =====
async function loadHistory() {
    const tbody = document.getElementById('historyBody');
    const countEl = document.getElementById('historyCount');
    if (!tbody) return;

    const { data, error } = await window.supabaseClient
        .from('datasets')
        .select('*')
        .order('created_at', { ascending: false });

    if (countEl) countEl.textContent = (data ? data.length : 0) + ' dataset(s)';

    if (error || !data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">No datasets yet. Upload your first CSV!</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(d =>
        '<tr>' +
        '<td><strong>' + d.file_name + '</strong></td>' +
        '<td>' + (d.metric_name || '—') + '</td>' +
        '<td>' + d.total_records + '</td>' +
        '<td style="font-size:12px">' + (d.start_time || '—') + ' → ' + (d.end_time || '—') + '</td>' +
        '<td style="font-size:12px">' + new Date(d.created_at).toLocaleString() + '</td>' +
        '<td>' +
            '<button class="btn-view" onclick="viewDataset(\'' + d.id + '\')">View</button> ' +
            '<button class="btn-delete" onclick="deleteDataset(\'' + d.id + '\')">Delete</button>' +
        '</td></tr>'
    ).join('');
}

// ===== Supabase: View Dataset =====
async function viewDataset(id) {
    const { data, error } = await window.supabaseClient.from('datasets').select('*').eq('id', id).single();
    if (error || !data) return showToast('Could not load dataset.');

    // Reconstruct records from stored raw_data
    state.records = (data.raw_data || []).map((r, i) => ({
        record_id: i + 1,
        timestamp: new Date(r.ts.replace(' ', 'T')),
        value: r.v
    }));
    state.errors = [];
    state.staged = { fileName: data.file_name };

    updateResults();
    showSection('results');
    showToast('Loaded: ' + data.file_name);
}

// ===== Supabase: Delete Dataset =====
async function deleteDataset(id) {
    if (!confirm('Delete this dataset permanently?')) return;
    const { error } = await window.supabaseClient.from('datasets').delete().eq('id', id);
    if (error) return showToast('Delete failed.');
    showToast('Deleted.');
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
    showToast('CSV exported.');
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
    showSection('upload');
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
