import type { TraceData, TraceServiceOptions } from './types.js';

export function generateTraceViewer(traceData: TraceData, _options: Required<TraceServiceOptions>): string {
    const totalDuration = traceData.endTime && traceData.startTime 
        ? traceData.endTime - traceData.startTime 
        : 0;

    // Flatten all actions for the timeline
    const allActions: Array<{ action: any; step: any; scenario: any }> = [];
    for (const scenario of traceData.scenarios) {
        for (const step of scenario.steps) {
            for (const action of step.actions) {
                allActions.push({ action, step, scenario });
            }
        }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(traceData.testName)} - Trace Viewer</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #1e1e1e;
            color: #cccccc;
            font-size: 13px;
            line-height: 1.4;
            height: 100vh;
            overflow: hidden;
        }

        /* Layout */
        .trace-viewer {
            display: grid;
            grid-template-rows: auto auto 1fr;
            height: 100vh;
        }

        /* Header */
        .header {
            background: #252526;
            padding: 8px 16px;
            border-bottom: 1px solid #3c3c3c;
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .header-title {
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
        }

        .header-meta {
            display: flex;
            gap: 16px;
            font-size: 12px;
            color: #888;
        }

        .status-badge {
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
        }

        .status-badge.passed { background: #2d4a3e; color: #4ec9b0; }
        .status-badge.failed { background: #4a2d2d; color: #f14c4c; }

        /* Filmstrip */
        .filmstrip {
            background: #1e1e1e;
            border-bottom: 1px solid #3c3c3c;
            padding: 8px;
            overflow-x: auto;
            white-space: nowrap;
        }

        .filmstrip-container {
            display: flex;
            gap: 4px;
            align-items: flex-end;
        }

        .filmstrip-frame {
            flex-shrink: 0;
            width: 80px;
            height: 50px;
            background: #2d2d2d;
            border: 2px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            overflow: hidden;
            position: relative;
        }

        .filmstrip-frame:hover {
            border-color: #555;
        }

        .filmstrip-frame.selected {
            border-color: #0078d4;
        }

        .filmstrip-frame img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .filmstrip-frame .timestamp {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.7);
            font-size: 9px;
            padding: 1px 3px;
            text-align: center;
        }

        /* Main Content */
        .main-content {
            display: grid;
            grid-template-columns: 280px 1fr 320px;
            overflow: hidden;
        }

        /* Actions Panel */
        .actions-panel {
            background: #252526;
            border-right: 1px solid #3c3c3c;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .panel-header {
            padding: 10px 12px;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #888;
            border-bottom: 1px solid #3c3c3c;
        }

        .actions-list {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }

        /* Scenario/Step/Action Tree */
        .tree-item {
            cursor: pointer;
        }

        .tree-header {
            display: flex;
            align-items: center;
            padding: 6px 12px;
            gap: 6px;
        }

        .tree-header:hover {
            background: #2a2d2e;
        }

        .tree-toggle {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #888;
            font-size: 10px;
            transition: transform 0.15s;
        }

        .tree-toggle.expanded {
            transform: rotate(90deg);
        }

        .tree-icon {
            font-size: 14px;
        }

        .tree-label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .tree-children {
            display: none;
            padding-left: 20px;
        }

        .tree-children.expanded {
            display: block;
        }

        /* Action Item */
        .action-item {
            display: flex;
            align-items: center;
            padding: 6px 12px;
            gap: 8px;
            cursor: pointer;
        }

        .action-item:hover {
            background: #2a2d2e;
        }

        .action-item.selected {
            background: #094771;
        }

        .action-icon {
            width: 18px;
            height: 18px;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: bold;
        }

        .action-icon.click { background: #4a3f6b; color: #c9a0dc; }
        .action-icon.fill { background: #3f5a4a; color: #a0dcb1; }
        .action-icon.navigate { background: #3f4a5a; color: #a0c4dc; }
        .action-icon.wait { background: #5a4a3f; color: #dcb1a0; }
        .action-icon.keyboard { background: #4a5a3f; color: #b1dca0; }
        .action-icon.select { background: #5a3f5a; color: #dca0dc; }
        .action-icon.scroll { background: #3f5a5a; color: #a0dcdc; }
        .action-icon.other { background: #4a4a4a; color: #cccccc; }

        .action-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .action-duration {
            font-size: 11px;
            color: #888;
        }

        .action-status {
            width: 6px;
            height: 6px;
            border-radius: 50%;
        }

        .action-status.passed { background: #4ec9b0; }
        .action-status.failed { background: #f14c4c; }

        /* Snapshot Panel */
        .snapshot-panel {
            background: #1e1e1e;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .snapshot-tabs {
            display: flex;
            background: #252526;
            border-bottom: 1px solid #3c3c3c;
        }

        .snapshot-tab {
            padding: 8px 16px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            font-size: 12px;
        }

        .snapshot-tab:hover {
            background: #2a2d2e;
        }

        .snapshot-tab.active {
            border-bottom-color: #0078d4;
            color: #ffffff;
        }

        .snapshot-content {
            flex: 1;
            overflow: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            background: #1a1a1a;
        }

        .snapshot-content img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 4px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }

        .snapshot-content iframe {
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 4px;
            background: #fff;
        }

        .no-snapshot {
            color: #666;
            font-style: italic;
        }

        /* Details Panel */
        .details-panel {
            background: #252526;
            border-left: 1px solid #3c3c3c;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .details-tabs {
            display: flex;
            background: #1e1e1e;
            border-bottom: 1px solid #3c3c3c;
            overflow-x: auto;
        }

        .details-tab {
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            font-size: 12px;
            white-space: nowrap;
        }

        .details-tab:hover {
            background: #2a2d2e;
        }

        .details-tab.active {
            border-bottom-color: #0078d4;
            color: #ffffff;
        }

        .details-tab .badge {
            background: #0e639c;
            color: #fff;
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 8px;
            margin-left: 4px;
        }

        .details-content {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }

        .detail-section {
            margin-bottom: 16px;
        }

        .detail-section-title {
            font-size: 11px;
            text-transform: uppercase;
            color: #888;
            margin-bottom: 8px;
        }

        .detail-row {
            display: flex;
            margin-bottom: 6px;
        }

        .detail-label {
            width: 80px;
            color: #888;
            flex-shrink: 0;
        }

        .detail-value {
            flex: 1;
            color: #ddd;
            word-break: break-all;
        }

        .detail-value.selector {
            font-family: 'Consolas', 'Monaco', monospace;
            color: #ce9178;
            font-size: 12px;
        }

        /* Console Log */
        .console-entry {
            padding: 4px 8px;
            border-bottom: 1px solid #2d2d2d;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
        }

        .console-entry.log { color: #cccccc; }
        .console-entry.info { color: #3794ff; }
        .console-entry.warning { color: #cca700; }
        .console-entry.error { color: #f14c4c; }

        .console-timestamp {
            color: #666;
            margin-right: 8px;
        }

        /* Network Log */
        .network-entry {
            font-size: 12px;
        }

        .network-entry:hover {
            background: #2a2d2e;
        }

        .network-method {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 10px;
            background: #2d2d2d;
        }

        .network-method.GET { color: #4ec9b0; }
        .network-method.POST { color: #dcdcaa; }
        .network-method.PUT { color: #569cd6; }
        .network-method.DELETE { color: #f14c4c; }

        .network-status {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
        }

        .network-status.success { background: #1e3a1e; color: #4ec9b0; }
        .network-status.redirect { background: #3a3a1e; color: #dcdcaa; }
        .network-status.error { background: #3a1e1e; color: #f14c4c; }

        .network-tab {
            background: transparent;
            border: none;
            color: #888;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 11px;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }

        .network-tab:hover {
            color: #ccc;
            background: #2a2d2e;
        }

        .network-tab.active {
            color: #4ec9b0;
            border-bottom-color: #4ec9b0;
        }

        .network-tab-content {
            animation: fadeIn 0.2s;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }

                .resource-filter {
                    background: transparent;
                    border: 1px solid #3c3c3c;
                    color: #888;
                    padding: 4px 12px;
                    cursor: pointer;
                    font-size: 11px;
                    border-radius: 3px;
                    transition: all 0.2s;
                }

                .resource-filter:hover {
                    color: #ccc;
                    border-color: #4ec9b0;
                }

                .resource-filter.active {
                    background: #0078d4;
                    color: #fff;
                    border-color: #0078d4;
                }

                .network-row:hover {
                    background: #2a2d2e;
                }

                .network-row.selected {
                    background: #094771;
                }
        }

        .network-url {
            color: #9cdcfe;
            font-family: 'Consolas', monospace;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            display: block;
            font-size: 11px;
            margin-top: 2px;
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }

        ::-webkit-scrollbar-track {
            background: #1e1e1e;
        }

        ::-webkit-scrollbar-thumb {
            background: #424242;
            border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        /* Empty State */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #666;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }

        /* Click pointer animation */
        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="trace-viewer">
        <!-- Header -->
        <div class="header">
            <div class="header-title">${escapeHtml(traceData.testName)}</div>
            <div class="header-meta">
                <span>${traceData.browser}${traceData.browserVersion ? ' ' + traceData.browserVersion : ''}</span>
                <span>${formatDuration(totalDuration)}</span>
                <span class="status-badge ${getOverallStatus(traceData)}">${getOverallStatus(traceData)}</span>
            </div>
        </div>

        <!-- Filmstrip -->
        <div class="filmstrip">
            <div class="filmstrip-container" id="filmstrip">
                ${generateFilmstrip(allActions, traceData.startTime || 0)}
            </div>
        </div>

        <!-- Main Content -->
        <div class="main-content">
            <!-- Actions Panel -->
            <div class="actions-panel">
                <div class="panel-header">Actions</div>
                <div class="actions-list" id="actionsList">
                    ${generateActionsTree(traceData)}
                </div>
            </div>

            <!-- Snapshot Panel -->
            <div class="snapshot-panel">
                <div class="snapshot-tabs">
                    <div class="snapshot-tab active" data-tab="before">Before</div>
                    <div class="snapshot-tab" data-tab="after">After</div>
                    <div class="snapshot-tab" data-tab="dom-before">DOM Before</div>
                    <div class="snapshot-tab" data-tab="dom-after">DOM After</div>
                </div>
                <div class="snapshot-content" id="snapshotContent">
                    <div class="no-snapshot">Select an action to view snapshot</div>
                </div>
            </div>

            <!-- Details Panel -->
            <div class="details-panel">
                <div class="details-tabs">
                    <div class="details-tab active" data-tab="call">Call</div>
                    <div class="details-tab" data-tab="console">Console <span class="badge">${traceData.consoleLogs.length}</span></div>
                    <div class="details-tab" data-tab="network">Network <span class="badge">${traceData.networkLogs.length}</span></div>
                </div>
                <div class="details-content" id="detailsContent">
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <div>Select an action to view details</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Trace data embedded (escaped for safe embedding in script tag)
        const traceData = JSON.parse(${JSON.stringify(JSON.stringify(traceData)).replace(/<\//g, '\\u003c/')});
        
        // Current state
        let selectedActionId = null;
        let currentSnapshotTab = 'before';
        let currentDetailsTab = 'call';

        // Build action index
        const actionIndex = new Map();
        for (const scenario of traceData.scenarios) {
            for (const step of scenario.steps) {
                for (const action of step.actions) {
                    actionIndex.set(action.id, { action, step, scenario });
                }
            }
        }

        // Helper functions
        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            setupEventListeners();
            
            // Select first action if available
            const firstAction = document.querySelector('.action-item');
            if (firstAction) {
                firstAction.click();
            }
        });

        function setupEventListeners() {
            // Filmstrip frames
            document.querySelectorAll('.filmstrip-frame').forEach(frame => {
                frame.addEventListener('click', () => {
                    const actionId = frame.dataset.actionId;
                    selectAction(actionId);
                });
            });

            // Action items
            document.querySelectorAll('.action-item').forEach(item => {
                item.addEventListener('click', () => {
                    const actionId = item.dataset.actionId;
                    selectAction(actionId);
                });
            });

            // Tree toggles
            document.querySelectorAll('.tree-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    if (e.target.closest('.action-item')) return;
                    const item = header.closest('.tree-item');
                    const toggle = item.querySelector('.tree-toggle');
                    const children = item.querySelector('.tree-children');
                    if (toggle && children) {
                        toggle.classList.toggle('expanded');
                        children.classList.toggle('expanded');
                    }
                });
            });

            // Snapshot tabs
            document.querySelectorAll('.snapshot-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.snapshot-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    currentSnapshotTab = tab.dataset.tab;
                    updateSnapshotView();
                });
            });

            // Details tabs
            document.querySelectorAll('.details-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.details-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    currentDetailsTab = tab.dataset.tab;
                    updateDetailsView();
                });
            });
        }

        function selectAction(actionId) {
            selectedActionId = actionId;

            // Update action list selection
            document.querySelectorAll('.action-item').forEach(item => {
                item.classList.toggle('selected', item.dataset.actionId === actionId);
            });

            // Update filmstrip selection
            document.querySelectorAll('.filmstrip-frame').forEach(frame => {
                frame.classList.toggle('selected', frame.dataset.actionId === actionId);
            });

            // Scroll filmstrip frame into view
            const selectedFrame = document.querySelector('.filmstrip-frame.selected');
            if (selectedFrame) {
                selectedFrame.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }

            // Update badge counts based on selected action
            updateBadgeCounts();
            
            updateSnapshotView();
            updateDetailsView();
        }
        
        function updateBadgeCounts() {
            const networkTab = document.querySelector('.details-tab[data-tab="network"] .badge');
            
            if (selectedActionId) {
                const data = actionIndex.get(selectedActionId);
                if (data?.action) {
                    // Show per-action network count
                    const networkCount = data.action.network?.length || 0;
                    if (networkTab) networkTab.textContent = networkCount;
                }
            } else {
                // Show global counts when no action selected
                if (networkTab) networkTab.textContent = traceData.networkLogs.length;
            }
        }

        function updateSnapshotView() {
            const container = document.getElementById('snapshotContent');
            
            if (!selectedActionId) {
                container.innerHTML = '<div class="no-snapshot">Select an action to view snapshot</div>';
                return;
            }

            const data = actionIndex.get(selectedActionId);
            if (!data) return;

            const { action } = data;
            
            // Handle DOM snapshot tabs
            if (currentSnapshotTab === 'dom-before' || currentSnapshotTab === 'dom-after') {
                const domSnapshot = currentSnapshotTab === 'dom-before' ? action.beforeDOM : action.afterDOM;
                if (domSnapshot) {
                    // Create browser-like frame with URL bar - fill full width/height
                    let html = '<div style="display:flex;flex-direction:column;width:100%;height:100%;border-radius:4px;overflow:hidden;background:#2d2d2d;">';
                    // Browser chrome (title bar)
                    html += '<div style="background:#2d2d2d;padding:6px 10px;display:flex;align-items:center;gap:8px;flex-shrink:0;">';
                    // Traffic light buttons
                    html += '<div style="display:flex;gap:6px;">';
                    html += '<div style="width:10px;height:10px;border-radius:50%;background:#ff5f57;"></div>';
                    html += '<div style="width:10px;height:10px;border-radius:50%;background:#febc2e;"></div>';
                    html += '<div style="width:10px;height:10px;border-radius:50%;background:#28c840;"></div>';
                    html += '</div>';
                    // URL bar
                    html += '<div style="flex:1;display:flex;align-items:center;background:#1e1e1e;border-radius:4px;padding:4px 10px;margin-left:8px;">';
                    html += '<span style="color:#888;margin-right:6px;font-size:12px;">🔒</span>';
                    html += '<span style="color:#aaa;font-size:12px;font-family:system-ui;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(action.pageUrl || 'about:blank') + '</span>';
                    html += '</div>';
                    html += '</div>';
                    // Page content iframe - fills remaining space
                    html += '<iframe src="' + domSnapshot + '" style="flex:1;width:100%;border:none;background:#fff;"></iframe>';
                    html += '</div>';
                    container.innerHTML = html;
                } else {
                    container.innerHTML = '<div class="no-snapshot">No DOM snapshot available</div>';
                }
                return;
            }
            
            // Handle screenshot tabs
            const snapshot = currentSnapshotTab === 'before' ? action.beforeSnapshot : action.afterSnapshot;

            if (snapshot) {
                // Render snapshot with click pointer overlay if available
                let html = '<div class="snapshot-container" style="position:relative;display:inline-block;">';
                html += '<img src="' + snapshot + '" alt="' + currentSnapshotTab + ' snapshot">';
                
                // Add click pointer for before snapshot on click actions
                if (currentSnapshotTab === 'before' && action.clickPoint) {
                    html += '<div class="click-pointer" style="position:absolute;left:' + action.clickPoint.x + 'px;top:' + action.clickPoint.y + 'px;transform:translate(-50%,-50%);pointer-events:none;">';
                    html += '<div style="width:20px;height:20px;border-radius:50%;background:rgba(255,0,0,0.5);border:2px solid red;animation:pulse 1s infinite;"></div>';
                    html += '<div style="position:absolute;top:24px;left:50%;transform:translateX(-50%);background:#1e1e1e;color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;white-space:nowrap;">';
                    html += '(' + action.clickPoint.x + ', ' + action.clickPoint.y + ')';
                    html += '</div></div>';
                }
                
                html += '</div>';
                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="no-snapshot">No ' + currentSnapshotTab + ' snapshot available</div>';
            }
        }

        function updateDetailsView() {
            const container = document.getElementById('detailsContent');

            if (currentDetailsTab === 'console') {
                container.innerHTML = generateConsoleView();
                return;
            }

            if (currentDetailsTab === 'network') {
                container.innerHTML = generateNetworkView();
                return;
            }

            // Call details
            if (!selectedActionId) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div>Select an action to view details</div></div>';
                return;
            }

            const data = actionIndex.get(selectedActionId);
            if (!data) return;

            const { action, step, scenario } = data;
            container.innerHTML = generateCallDetails(action, step, scenario);
        }

        function generateCallDetails(action, step, scenario) {
            let html = '<div class="detail-section">';
            html += '<div class="detail-section-title">Action</div>';
            html += '<div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">' + escapeHtml(action.name) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">' + action.status + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">' + (action.duration || 0) + 'ms</span></div>';
            
            if (action.selector) {
                html += '<div class="detail-row"><span class="detail-label">Selector</span><span class="detail-value selector">' + escapeHtml(action.selector) + '</span></div>';
            }
            
            if (action.value !== undefined) {
                html += '<div class="detail-row"><span class="detail-label">Value</span><span class="detail-value">' + escapeHtml(String(action.value)) + '</span></div>';
            }
            
            if (action.error) {
                html += '<div class="detail-row"><span class="detail-label">Error</span><span class="detail-value" style="color:#f14c4c">' + escapeHtml(action.error) + '</span></div>';
            }
            html += '</div>';

            if (action.targetElement) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Target Element</div>';
                html += '<div class="detail-row"><span class="detail-label">Tag</span><span class="detail-value">' + escapeHtml(action.targetElement.tagName || '') + '</span></div>';
                
                if (action.targetElement.id) {
                    html += '<div class="detail-row"><span class="detail-label">ID</span><span class="detail-value">' + escapeHtml(action.targetElement.id) + '</span></div>';
                }
                
                if (action.targetElement.className) {
                    html += '<div class="detail-row"><span class="detail-label">Class</span><span class="detail-value">' + escapeHtml(action.targetElement.className) + '</span></div>';
                }
                
                if (action.targetElement.textContent) {
                    html += '<div class="detail-row"><span class="detail-label">Text</span><span class="detail-value">' + escapeHtml(action.targetElement.textContent) + '</span></div>';
                }
                
                if (action.targetElement.inputValue) {
                    html += '<div class="detail-row"><span class="detail-label">Input Value</span><span class="detail-value">' + escapeHtml(action.targetElement.inputValue) + '</span></div>';
                }
                
                if (action.targetElement.boundingBox) {
                    const box = action.targetElement.boundingBox;
                    html += '<div class="detail-row"><span class="detail-label">Position</span><span class="detail-value">(' + Math.round(box.x) + ', ' + Math.round(box.y) + ') ' + Math.round(box.width) + '×' + Math.round(box.height) + '</span></div>';
                }
                html += '</div>';
            }
            
            if (action.clickPoint) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Click Point</div>';
                html += '<div class="detail-row"><span class="detail-label">X</span><span class="detail-value">' + action.clickPoint.x + 'px</span></div>';
                html += '<div class="detail-row"><span class="detail-label">Y</span><span class="detail-value">' + action.clickPoint.y + 'px</span></div>';
                html += '</div>';
            }

            html += '<div class="detail-section">';
            html += '<div class="detail-section-title">Context</div>';
            html += '<div class="detail-row"><span class="detail-label">Step</span><span class="detail-value">' + escapeHtml(step.keyword + ' ' + step.name) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Scenario</span><span class="detail-value">' + escapeHtml(scenario.name) + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Page</span><span class="detail-value">' + escapeHtml(action.pageTitle || '') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">URL</span><span class="detail-value" style="font-size:11px">' + escapeHtml(action.pageUrl || '') + '</span></div>';
            html += '</div>';

            return html;
        }

        function generateConsoleView() {
            if (traceData.consoleLogs.length === 0) {
                return '<div class="empty-state"><div class="empty-state-icon">📝</div><div>No console logs captured</div></div>';
            }

            let html = '';
            for (const entry of traceData.consoleLogs) {
                const time = new Date(entry.timestamp).toLocaleTimeString();
                html += '<div class="console-entry ' + entry.type + '">';
                html += '<span class="console-timestamp">' + time + '</span>';
                html += escapeHtml(entry.message);
                html += '</div>';
            }
            return html;
        }

        function generateNetworkView() {
            let entries = traceData.networkLogs;
            let actionStart = 0;
            
            if (selectedActionId) {
                const data = actionIndex.get(selectedActionId);
                if (data?.action?.network) {
                    entries = data.action.network;
                    actionStart = data.action.timestamp;
                }
            }

            if (entries.length === 0) {
                return '<div class="empty-state"><div class="empty-state-icon">🌐</div><div>No network requests ' + (selectedActionId ? 'for this action' : 'captured') + '</div></div>';
            }

            // Calculate timing range
            const minStart = Math.min(...entries.map(e => e.timestamp)) || 0;
            const maxEnd = Math.max(...entries.map(e => (e.timestamp + (e.duration || 0)))) || minStart + 1000;
            const totalDuration = maxEnd - minStart;

            let html = '<div style="display:flex;flex-direction:column;height:100%">';
            
            // Resource type filters
            html += '<div style="display:flex;gap:4px;padding:8px;background:#1e1e1e;border-bottom:1px solid #3c3c3c;font-size:11px">';
            html += '<button class="resource-filter active" onclick="filterNetworkByType(\\'all\\')">All</button>';
            html += '<button class="resource-filter" onclick="filterNetworkByType(\\'document\\')">Document</button>';
            html += '<button class="resource-filter" onclick="filterNetworkByType(\\'stylesheet\\')">CSS</button>';
            html += '<button class="resource-filter" onclick="filterNetworkByType(\\'script\\')">JS</button>';
            html += '<button class="resource-filter" onclick="filterNetworkByType(\\'image\\')">Img</button>';
            html += '<button class="resource-filter" onclick="filterNetworkByType(\\'xhr\\')">XHR</button>';
            html += '<button class="resource-filter" onclick="filterNetworkByType(\\'font\\')">Font</button>';
            html += '</div>';
            
            // Waterfall timeline header
            html += '<div style="background:#252525;border-bottom:1px solid #3c3c3c;padding:4px 8px;font-size:10px;color:#888">';
            html += 'Timeline (' + totalDuration + 'ms)';
            html += '</div>';
            
            // Table header + waterfall
            html += '<div style="flex:1;overflow-y:auto">';
            html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
            html += '<thead style="position:sticky;top:0;background:#1e1e1e;z-index:1">';
            html += '<tr style="border-bottom:1px solid #3c3c3c">';
            html += '<th style="text-align:left;padding:8px;width:250px;color:#888">Name</th>';
            html += '<th style="text-align:left;padding:8px;width:60px;color:#888">Method</th>';
            html += '<th style="text-align:left;padding:8px;width:60px;color:#888">Status</th>';
            html += '<th style="text-align:left;padding:8px;width:150px;color:#888">Type</th>';
            html += '<th style="text-align:right;padding:8px;width:80px;color:#888">Size</th>';
            html += '<th style="text-align:right;padding:8px;width:80px;color:#888">Time</th>';
            html += '<th style="text-align:left;padding:8px;min-width:300px;color:#888">Waterfall</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const statusClass = entry.status ? (entry.status < 300 ? 'success' : entry.status < 400 ? 'redirect' : 'error') : '';
                const url = new URL(entry.url || 'http://localhost');
                const fileName = url.pathname.split('/').pop() || url.pathname || url.host;
                const resourceType = getResourceType(entry);
                
                // Calculate waterfall position
                const startOffset = entry.timestamp - minStart;
                const startPercent = (startOffset / totalDuration) * 100;
                const widthPercent = ((entry.duration || 50) / totalDuration) * 100;
                
                html += '<tr class="network-row" data-type="' + resourceType + '" style="border-bottom:1px solid #2d2d2d;cursor:pointer" onclick="selectNetworkRequest(' + i + ')">';
                html += '<td style="padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(entry.url) + '">';
                html += '<span style="color:#9cdcfe">' + escapeHtml(fileName) + '</span>';
                html += '</td>';
                html += '<td style="padding:6px 8px"><span class="network-method ' + entry.method + '">' + entry.method + '</span></td>';
                html += '<td style="padding:6px 8px"><span class="network-status ' + statusClass + '">' + (entry.status || '-') + '</span></td>';
                html += '<td style="padding:6px 8px;color:#888">' + (entry.mimeType || resourceType) + '</td>';
                html += '<td style="padding:6px 8px;text-align:right;color:#888">' + (entry.size ? formatBytes(entry.size) : '-') + '</td>';
                html += '<td style="padding:6px 8px;text-align:right;color:#888">' + (entry.duration ? entry.duration + 'ms' : '-') + '</td>';
                html += '<td style="padding:6px 8px">';
                html += '<div style="position:relative;height:20px">';
                html += '<div style="position:absolute;left:' + startPercent.toFixed(2) + '%;width:' + Math.max(widthPercent, 1).toFixed(2) + '%;height:16px;background:' + getResourceColor(resourceType) + ';border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,0.3)" title="Start: ' + startOffset + 'ms, Duration: ' + (entry.duration || 0) + 'ms"></div>';
                html += '</div>';
                html += '</td>';
                html += '</tr>';
            }
            
            html += '</tbody>';
            html += '</table>';
            html += '</div>';
            html += '</div>';
            
            return html;
        }
        
        function getResourceType(entry) {
            const mime = (entry.mimeType || '').toLowerCase();
            const url = (entry.url || '').toLowerCase();
            
            if (mime.includes('html') || entry.resourceType === 'document') return 'document';
            if (mime.includes('css') || url.endsWith('.css')) return 'stylesheet';
            if (mime.includes('javascript') || mime.includes('ecmascript') || url.endsWith('.js')) return 'script';
            if (mime.includes('image') || url.match(/\\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) return 'image';
            if (mime.includes('font') || url.match(/\\.(woff|woff2|ttf|otf|eot)$/)) return 'font';
            if (mime.includes('json') || entry.resourceType === 'xhr' || entry.resourceType === 'fetch') return 'xhr';
            return entry.resourceType || 'other';
        }
        
        function getResourceColor(type) {
            const colors = {
                'document': '#4ec9b0',
                'stylesheet': '#569cd6',
                'script': '#dcdcaa',
                'image': '#c586c0',
                'font': '#9cdcfe',
                'xhr': '#ce9178',
                'other': '#808080'
            };
            return colors[type] || colors.other;
        }
        
        let selectedNetworkIndex = -1;
        
        function selectNetworkRequest(index) {
            selectedNetworkIndex = index;
            const entries = selectedActionId ? 
                (actionIndex.get(selectedActionId)?.action?.network || traceData.networkLogs) : 
                traceData.networkLogs;
            const entry = entries[index];
            
            // Show details in a modal or side panel
            showNetworkDetailsModal(entry, index);
        }
        
        function showNetworkDetailsModal(entry, index) {
            // Create modal overlay
            let modal = document.getElementById('network-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'network-modal';
                modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center';
                document.body.appendChild(modal);
            }
            
            modal.innerHTML = '<div style="background:#1e1e1e;border:1px solid #3c3c3c;border-radius:8px;width:80%;max-width:900px;max-height:80%;display:flex;flex-direction:column">' +
                '<div style="padding:12px 16px;border-bottom:1px solid #3c3c3c;display:flex;justify-content:space-between;align-items:center">' +
                '<div style="font-weight:bold;font-size:14px">' + escapeHtml(entry.url) + '</div>' +
                '<button onclick="closeNetworkModal()" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:0 8px">✕</button>' +
                '</div>' +
                '<div style="display:flex;border-bottom:1px solid #3c3c3c">' +
                '<button class="network-tab active" onclick="showModalTab(\\'headers\\')">Headers</button>' +
                '<button class="network-tab" onclick="showModalTab(\\'payload\\')">Payload</button>' +
                '<button class="network-tab" onclick="showModalTab(\\'preview\\')">Preview</button>' +
                '<button class="network-tab" onclick="showModalTab(\\'timing\\')">Timing</button>' +
                '</div>' +
                '<div style="flex:1;overflow-y:auto;padding:16px">' +
                '<div id="modal-headers" class="modal-tab-content">' + generateNetworkHeadersTab(entry) + '</div>' +
                '<div id="modal-payload" class="modal-tab-content" style="display:none">' + generateNetworkPayloadTab(entry) + '</div>' +
                '<div id="modal-preview" class="modal-tab-content" style="display:none">' + generateNetworkPreviewTab(entry) + '</div>' +
                '<div id="modal-timing" class="modal-tab-content" style="display:none">' + generateNetworkTimingTab(entry) + '</div>' +
                '</div>' +
                '</div>';
            
            modal.style.display = 'flex';
            modal.onclick = (e) => { if (e.target === modal) closeNetworkModal(); };
        }
        
        function closeNetworkModal() {
            const modal = document.getElementById('network-modal');
            if (modal) modal.style.display = 'none';
        }
        
        function showModalTab(tabName) {
            document.querySelectorAll('.modal-tab-content').forEach(c => c.style.display = 'none');
            const target = document.getElementById('modal-' + tabName);
            if (target) target.style.display = 'block';
            
            document.querySelectorAll('#network-modal .network-tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
        }
        
        let currentNetworkFilter = 'all';
        
        function filterNetworkByType(type) {
            currentNetworkFilter = type;
            document.querySelectorAll('.resource-filter').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            document.querySelectorAll('.network-row').forEach(row => {
                if (type === 'all' || row.dataset.type === type) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }
        
        function generateNetworkHeadersTab(entry) {
            let html = '<div style="font-size:11px">';
            html += '<div style="margin-bottom:16px">';
            html += '<div style="color:#dcdcaa;font-weight:bold;margin-bottom:8px">General</div>';
            html += '<div style="display:grid;grid-template-columns:150px 1fr;gap:4px 16px">';
            html += '<span style="color:#888">Request URL:</span><span style="color:#ccc;word-break:break-all">' + escapeHtml(entry.url) + '</span>';
            html += '<span style="color:#888">Request Method:</span><span style="color:#ccc">' + entry.method + '</span>';
            if (entry.status) html += '<span style="color:#888">Status Code:</span><span style="color:#ccc">' + entry.status + ' ' + (entry.statusText || '') + '</span>';
            if (entry.mimeType) html += '<span style="color:#888">Content-Type:</span><span style="color:#ccc">' + escapeHtml(entry.mimeType) + '</span>';
            html += '</div></div>';
            
            if (entry.requestHeaders && Object.keys(entry.requestHeaders).length > 0) {
                html += '<div style="margin-bottom:16px">';
                html += '<div style="color:#dcdcaa;font-weight:bold;margin-bottom:8px">Request Headers (' + Object.keys(entry.requestHeaders).length + ')</div>';
                html += '<div style="display:grid;grid-template-columns:200px 1fr;gap:4px 16px">';
                for (const [key, val] of Object.entries(entry.requestHeaders)) {
                    html += '<span style="color:#4ec9b0">' + escapeHtml(key) + ':</span>';
                    html += '<span style="color:#ccc;word-break:break-all">' + escapeHtml(String(val)) + '</span>';
                }
                html += '</div></div>';
            }
            
            if (entry.responseHeaders && Object.keys(entry.responseHeaders).length > 0) {
                html += '<div>';
                html += '<div style="color:#dcdcaa;font-weight:bold;margin-bottom:8px">Response Headers (' + Object.keys(entry.responseHeaders).length + ')</div>';
                html += '<div style="display:grid;grid-template-columns:200px 1fr;gap:4px 16px">';
                for (const [key, val] of Object.entries(entry.responseHeaders)) {
                    html += '<span style="color:#4ec9b0">' + escapeHtml(key) + ':</span>';
                    html += '<span style="color:#ccc;word-break:break-all">' + escapeHtml(String(val)) + '</span>';
                }
                html += '</div></div>';
            }
            html += '</div>';
            return html;
        }
        
        function generateNetworkPayloadTab(entry) {
            let html = '<div style="font-size:11px">';
            
            if (entry.requestBody) {
                html += '<div style="margin-bottom:16px">';
                html += '<div style="color:#dcdcaa;font-weight:bold;margin-bottom:8px">Request Payload</div>';
                if (entry.requestBodySize) html += '<div style="color:#888;margin-bottom:4px">Size: ' + formatBytes(entry.requestBodySize) + '</div>';
                html += '<pre style="background:#252525;padding:8px;border-radius:4px;overflow-x:auto;color:#ccc;margin:0">' + escapeHtml(entry.requestBody) + '</pre>';
                html += '</div>';
            } else {
                html += '<div style="color:#888;margin-bottom:16px">No request payload</div>';
            }
            
            if (entry.responseBody) {
                html += '<div>';
                html += '<div style="color:#dcdcaa;font-weight:bold;margin-bottom:8px">Response Body</div>';
                if (entry.responseBodySize) html += '<div style="color:#888;margin-bottom:4px">Size: ' + formatBytes(entry.responseBodySize) + '</div>';
                html += '<pre style="background:#252525;padding:8px;border-radius:4px;overflow-x:auto;color:#ccc;margin:0;max-height:300px">' + escapeHtml(entry.responseBody.substring(0, 5000)) + (entry.responseBody.length > 5000 ? '\\n... (truncated)' : '') + '</pre>';
                html += '</div>';
            } else if (entry.responseBodySize !== undefined) {
                html += '<div>';
                html += '<div style="color:#dcdcaa;font-weight:bold;margin-bottom:8px">Response Body</div>';
                html += '<div style="color:#888;margin-bottom:4px">Size: ' + formatBytes(entry.responseBodySize) + '</div>';
                html += '<div style="color:#888;font-style:italic">Body content not captured (BiDi limitation)</div>';
                html += '</div>';
            } else {
                html += '<div style="color:#888">No response body captured</div>';
            }
            
            html += '</div>';
            return html;
        }
        
        function generateNetworkPreviewTab(entry) {
            let html = '<div style="font-size:11px">';
            
            if (entry.responseBody && entry.mimeType) {
                const mimeType = entry.mimeType.toLowerCase();
                
                if (mimeType.includes('json')) {
                    try {
                        const json = JSON.parse(entry.responseBody);
                        html += '<pre style="background:#252525;padding:8px;border-radius:4px;overflow-x:auto;color:#ccc;margin:0">' + escapeHtml(JSON.stringify(json, null, 2)) + '</pre>';
                    } catch (e) {
                        html += '<div style="color:#888">Invalid JSON</div>';
                    }
                } else if (mimeType.includes('html')) {
                    // Render HTML in an iframe with base URL for proper resource loading
                    const baseUrl = entry.url || '';
                    const baseOrigin = baseUrl ? new URL(baseUrl).origin : '';
                    const htmlWithBase = '<!DOCTYPE html><html><head><base href="' + escapeHtml(baseOrigin + '/') + '"></head><body>' + entry.responseBody.substring(0, 50000) + '</body></html>';
                    html += '<iframe sandbox="allow-same-origin" style="width:100%;height:400px;border:1px solid #444;border-radius:4px;background:#fff" srcdoc="' + escapeHtml(htmlWithBase).replace(/"/g, '&quot;') + '"></iframe>';
                } else if (mimeType.includes('image')) {
                    // Check if we have base64 image data
                    if (entry.responseBody.startsWith('[base64]')) {
                        const base64Data = entry.responseBody.substring(8); // Remove '[base64]' prefix (8 chars)
                        html += '<div style="background:#252525;padding:16px;border-radius:4px;text-align:center">';
                        html += '<img src="data:' + mimeType + ';base64,' + base64Data + '" style="max-width:100%;max-height:400px;border-radius:4px" />';
                        html += '</div>';
                    } else {
                        // Try to load from URL directly
                        html += '<div style="background:#252525;padding:16px;border-radius:4px;text-align:center">';
                        html += '<img src="' + escapeHtml(entry.url) + '" style="max-width:100%;max-height:400px;border-radius:4px" onerror="this.style.display=\\'none\\';this.parentNode.insertAdjacentHTML(\\'beforeend\\',\\'<span style=color:#888>Image could not be loaded</span>\\')"/>';
                        html += '</div>';
                    }
                } else if (mimeType.includes('css')) {
                    // Syntax highlight CSS
                    html += '<pre style="background:#252525;padding:8px;border-radius:4px;overflow-x:auto;color:#ce9178;margin:0;max-height:400px">' + escapeHtml(entry.responseBody.substring(0, 10000)) + '</pre>';
                } else if (mimeType.includes('javascript')) {
                    // Syntax highlight JS
                    html += '<pre style="background:#252525;padding:8px;border-radius:4px;overflow-x:auto;color:#dcdcaa;margin:0;max-height:400px">' + escapeHtml(entry.responseBody.substring(0, 10000)) + '</pre>';
                } else if (mimeType.includes('font') || mimeType.includes('woff')) {
                    html += '<div style="color:#888;padding:16px;text-align:center">Font file (' + escapeHtml(mimeType) + ')</div>';
                } else {
                    html += '<pre style="background:#252525;padding:8px;border-radius:4px;overflow-x:auto;color:#ccc;margin:0;max-height:400px">' + escapeHtml(entry.responseBody.substring(0, 5000)) + '</pre>';
                }
            } else {
                html += '<div style="color:#888">No preview available</div>';
            }
            
            html += '</div>';
            return html;
        }
        
        function generateNetworkTimingTab(entry) {
            let html = '<div style="font-size:11px">';
            
            if (entry.timing || entry.duration) {
                html += '<div style="color:#dcdcaa;font-weight:bold;margin-bottom:12px">Request Timing</div>';
                html += '<div style="display:grid;grid-template-columns:200px 1fr;gap:8px 16px">';
                
                if (entry.duration) {
                    html += '<span style="color:#888">Total Duration:</span>';
                    html += '<span style="color:#ccc">' + entry.duration + ' ms</span>';
                }
                
                if (entry.timing) {
                    const t = entry.timing;
                    if (t.responseStart && t.startTime) {
                        const ttfb = t.responseStart - t.startTime;
                        html += '<span style="color:#888">Waiting (TTFB):</span>';
                        html += '<span style="color:#ccc">' + ttfb + ' ms</span>';
                    }
                    if (t.responseEnd && t.responseStart) {
                        const download = t.responseEnd - t.responseStart;
                        html += '<span style="color:#888">Content Download:</span>';
                        html += '<span style="color:#ccc">' + download + ' ms</span>';
                    }
                }
                
                html += '</div>';
                
                // Visual timeline
                if (entry.duration) {
                    html += '<div style="margin-top:16px">';
                    html += '<div style="color:#888;margin-bottom:8px">Timeline</div>';
                    html += '<div style="background:#252525;height:20px;border-radius:4px;position:relative;overflow:hidden">';
                    html += '<div style="background:#4ec9b0;height:100%;width:' + Math.min(100, (entry.duration / 1000) * 100) + '%"></div>';
                    html += '</div>';
                    html += '</div>';
                }
            } else {
                html += '<div style="color:#888">No timing data available</div>';
            }
            
            html += '</div>';
            return html;
        }
    </script>
</body>
</html>`;
}

// Helper functions
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function getOverallStatus(traceData: TraceData): 'passed' | 'failed' {
    return traceData.scenarios.every(s => s.status === 'passed') ? 'passed' : 'failed';
}

function generateFilmstrip(allActions: Array<{ action: any }>, startTime: number): string {
    return allActions.map(({ action }) => {
        const snapshot = action.beforeSnapshot || action.afterSnapshot;
        const relativeTime = ((action.timestamp || 0) - startTime) / 1000;
        
        if (!snapshot) {
            return `<div class="filmstrip-frame" data-action-id="${action.id}">
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">${action.name}</div>
                <div class="timestamp">${relativeTime.toFixed(1)}s</div>
            </div>`;
        }

        return `<div class="filmstrip-frame" data-action-id="${action.id}">
            <img src="${snapshot}" alt="${escapeHtml(action.name)}">
            <div class="timestamp">${relativeTime.toFixed(1)}s</div>
        </div>`;
    }).join('');
}

function generateActionsTree(traceData: TraceData): string {
    let html = '';
    
    for (const scenario of traceData.scenarios) {
        html += `<div class="tree-item">
            <div class="tree-header">
                <span class="tree-toggle expanded">▶</span>
                <span class="tree-icon">📁</span>
                <span class="tree-label">${escapeHtml(scenario.name)}</span>
            </div>
            <div class="tree-children expanded">`;
        
        for (const step of scenario.steps) {
            html += `<div class="tree-item">
                <div class="tree-header">
                    <span class="tree-toggle expanded">▶</span>
                    <span class="tree-icon">${getStepIcon(step.keyword)}</span>
                    <span class="tree-label">${escapeHtml(step.keyword)} ${escapeHtml(step.name)}</span>
                </div>
                <div class="tree-children expanded">`;
            
            for (const action of step.actions) {
                html += `<div class="action-item" data-action-id="${action.id}">
                    <span class="action-icon ${action.category}">${getActionIcon(action.category)}</span>
                    <span class="action-name">${formatActionName(action)}</span>
                    <span class="action-duration">${action.duration || 0}ms</span>
                    <span class="action-status ${action.status}"></span>
                </div>`;
            }
            
            html += '</div></div>';
        }
        
        html += '</div></div>';
    }
    
    return html;
}

function getStepIcon(keyword: string): string {
    const kw = keyword.toLowerCase().trim();
    if (kw === 'given') return '📋';
    if (kw === 'when') return '▶️';
    if (kw === 'then') return '✓';
    if (kw === 'and' || kw === 'but') return '➕';
    return '•';
}

function getActionIcon(category: string): string {
    const icons: Record<string, string> = {
        'click': '🖱',
        'fill': '✏',
        'navigate': '🔗',
        'wait': '⏳',
        'keyboard': '⌨',
        'select': '☑',
        'scroll': '↕',
        'other': '•'
    };
    return icons[category] || '•';
}

function formatActionName(action: any): string {
    let name = action.name;
    
    if (action.selector) {
        const shortSelector = action.selector.length > 20 
            ? action.selector.substring(0, 20) + '...' 
            : action.selector;
        name += ` (${escapeHtml(shortSelector)})`;
    }
    
    if (action.value && action.category === 'fill') {
        const shortValue = action.value.length > 15 
            ? action.value.substring(0, 15) + '...' 
            : action.value;
        name += ` "${escapeHtml(shortValue)}"`;
    }
    
    return name;
}
