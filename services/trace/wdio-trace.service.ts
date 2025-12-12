import * as fs from 'fs';
import * as path from 'path';
import type {
    TraceServiceOptions,
    TraceData,
    TraceScenario,
    TraceStep,
    TraceAction,
    ConsoleEntry,
    NetworkEntry
} from './types.js';
import { generateTraceViewer } from './trace-viewer.js';

const DEFAULT_COMMANDS_TO_TRACE = [
    'click', 'doubleClick', 'rightClick',
    'setValue', 'addValue', 'clearValue',
    'selectByVisibleText', 'selectByAttribute', 'selectByIndex',
    'moveTo', 'dragAndDrop',
    'scrollIntoView', 'scroll',
    'waitForDisplayed', 'waitForEnabled', 'waitForExist', 'waitForClickable',
    'url', 'navigateTo', 'back', 'forward', 'refresh',
    'switchToFrame', 'switchToParentFrame', 'switchToWindow',
    'keys', 'uploadFile',
    'newWindow', 'closeWindow',
    'pause'
];

const COMMAND_CATEGORIES: Record<string, TraceAction['category']> = {
    'click': 'click', 'doubleClick': 'click', 'rightClick': 'click',
    'setValue': 'fill', 'addValue': 'fill', 'clearValue': 'fill',
    'selectByVisibleText': 'select', 'selectByAttribute': 'select', 'selectByIndex': 'select',
    'keys': 'keyboard',
    'url': 'navigate', 'navigateTo': 'navigate', 'back': 'navigate', 'forward': 'navigate', 'refresh': 'navigate',
    'waitForDisplayed': 'wait', 'waitForEnabled': 'wait', 'waitForExist': 'wait', 'waitForClickable': 'wait', 'pause': 'wait',
    'scrollIntoView': 'scroll', 'scroll': 'scroll'
};

export default class TraceService {
    private options: Required<TraceServiceOptions>;
    private traceData: TraceData | null = null;
    private currentScenario: TraceScenario | null = null;
    private currentStep: TraceStep | null = null;
    private snapshotCount = 0;
    private outputDir: string;
    private traceDir: string = '';
    private _browser: WebdriverIO.Browser | null = null;
    private pendingAction: TraceAction | null = null;
    private currentSelector: string | null = null;

    constructor(serviceOptions: TraceServiceOptions = {}) {
        this.options = {
            outputDir: serviceOptions.outputDir || './trace-output',
            screenshots: serviceOptions.screenshots ?? true,
            snapshots: serviceOptions.snapshots ?? true,
            consoleLogs: serviceOptions.consoleLogs ?? true,
            network: serviceOptions.network ?? true,
            maxSnapshots: serviceOptions.maxSnapshots ?? 1000,
            highlightColor: serviceOptions.highlightColor || 'rgba(255, 0, 0, 0.3)',
            commandsToTrace: serviceOptions.commandsToTrace ?? DEFAULT_COMMANDS_TO_TRACE
        };
        this.outputDir = this.options.outputDir;
    }

    async onPrepare(): Promise<void> {
        if (fs.existsSync(this.outputDir)) {
            fs.rmSync(this.outputDir, { recursive: true });
        }
        fs.mkdirSync(this.outputDir, { recursive: true });
    }

    async before(
        capabilities: WebdriverIO.Capabilities,
        specs: string[],
        browser: WebdriverIO.Browser
    ): Promise<void> {
        this._browser = browser;
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.traceDir = path.join(this.outputDir, `trace-${timestamp}`);
        fs.mkdirSync(this.traceDir, { recursive: true });
        fs.mkdirSync(path.join(this.traceDir, 'snapshots'), { recursive: true });

        const viewport = await this.getViewport(browser);
        const userAgent = await this.getUserAgent(browser);

        this.traceData = {
            version: '1.0.0',
            testName: path.basename(specs[0] || 'Unknown Test'),
            browser: capabilities.browserName || 'unknown',
            browserVersion: capabilities.browserVersion,
            platform: capabilities.platformName || process.platform,
            startTime: Date.now(),
            scenarios: [],
            consoleLogs: [],
            networkLogs: [],
            metadata: {
                baseUrl: (browser as any).options?.baseUrl,
                viewport,
                userAgent
            }
        };

        // Setup console capture
        if (this.options.consoleLogs) {
            await this.setupConsoleCapture(browser);
        }

        // Setup network capture
        if (this.options.network) {
            await this.setupNetworkCapture(browser);
        }
    }

    async beforeScenario(world: any): Promise<void> {
        this.currentScenario = {
            id: `scenario-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: world.pickle?.name || 'Unknown Scenario',
            feature: world.gherkinDocument?.feature?.name || 'Unknown Feature',
            featureFile: world.gherkinDocument?.uri,
            tags: world.pickle?.tags?.map((t: any) => t.name) || [],
            startTime: Date.now(),
            status: 'pending',
            steps: []
        };

        if (this.traceData) {
            this.traceData.scenarios.push(this.currentScenario);
        }
    }

    async beforeStep(step: any, _scenario: any): Promise<void> {
        this.currentStep = {
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: step.text || 'Unknown Step',
            keyword: step.keyword?.trim() || '',
            startTime: Date.now(),
            status: 'pending',
            actions: [],
            location: step.location ? { file: step.uri || '', line: step.location.line } : undefined
        };

        if (this.currentScenario) {
            this.currentScenario.steps.push(this.currentStep);
        }
    }

    async beforeCommand(commandName: string, args: any[]): Promise<void> {
        if (!this.shouldTraceCommand(commandName)) return;

        // For navigation commands, don't try to capture element selector
        const isNavigation = ['url', 'navigateTo', 'back', 'forward', 'refresh'].includes(commandName);
        this.currentSelector = isNavigation ? null : this.extractSelector(args);
        
        // Capture BEFORE screenshot with element highlighted
        const beforeSnapshot = await this.captureScreenshot('before', this.currentSelector);
        // Capture BEFORE DOM snapshot
        const beforeDOM = this.options.snapshots ? await this.captureDOMSnapshot('before', this.currentSelector) : undefined;
        
        const pageInfo = await this.getPageInfo();
        const targetElement = isNavigation ? undefined : await this.getTargetElementInfo(this.currentSelector);
        
        // Calculate click point for click/tap actions
        const isClickAction = ['click', 'doubleClick', 'tap'].includes(commandName);
        const clickPoint = isClickAction ? await this.getClickPoint(this.currentSelector, targetElement) : undefined;

        this.pendingAction = {
            id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            wallTime: Date.now(),
            type: this.getActionType(commandName),
            category: COMMAND_CATEGORIES[commandName] || 'other',
            name: commandName,
            selector: this.currentSelector || undefined,
            value: this.extractValue(commandName, args),
            beforeSnapshot,
            beforeDOM,
            pageUrl: pageInfo.url,
            pageTitle: pageInfo.title,
            targetElement,
            clickPoint,
            status: 'pending'
        };
    }

    async afterCommand(
        commandName: string,
        _args: any[],
        _result: unknown,
        error?: Error
    ): Promise<void> {
        if (!this.shouldTraceCommand(commandName) || !this.pendingAction) return;

        const action = this.pendingAction;
        this.pendingAction = null;

        action.duration = Date.now() - action.timestamp;
        action.status = error ? 'failed' : 'passed';
        
        if (error) {
            action.error = error.message;
        }

        // Capture AFTER screenshot (no highlight, shows result of action)
        if (this.snapshotCount < this.options.maxSnapshots) {
            action.afterSnapshot = await this.captureScreenshot('after', null);
            // Capture AFTER DOM snapshot
            if (this.options.snapshots) {
                action.afterDOM = await this.captureDOMSnapshot('after', null);
            }
            this.snapshotCount++;
        }

        // Update page info after action
        const pageInfo = await this.getPageInfo();
        action.pageUrl = pageInfo.url;
        action.pageTitle = pageInfo.title;

        // Get updated element info (e.g., to show new input value)
        if (this.currentSelector) {
            action.targetElement = await this.getTargetElementInfo(this.currentSelector);
        }

        if (this.currentStep) {
            this.currentStep.actions.push(action);
        }
        
        this.currentSelector = null;
    }

    async afterStep(
        _step: any,
        _scenario: any,
        result: { passed: boolean; error?: string; duration: number }
    ): Promise<void> {
        if (this.currentStep) {
            this.currentStep.endTime = Date.now();
            this.currentStep.status = result.passed ? 'passed' : 'failed';
            if (result.error) this.currentStep.error = result.error;
        }
        this.currentStep = null;
    }

    async afterScenario(
        _world: any,
        result: { passed: boolean; error?: string; duration: number }
    ): Promise<void> {
        if (this.currentScenario) {
            this.currentScenario.endTime = Date.now();
            this.currentScenario.status = result.passed ? 'passed' : 'failed';
        }
        this.currentScenario = null;
    }

    async after(_result: number): Promise<void> {
        if (this.traceData) {
            this.traceData.endTime = Date.now();

            const traceJsonPath = path.join(this.traceDir, 'trace.json');
            fs.writeFileSync(traceJsonPath, JSON.stringify(this.traceData, null, 2));

            const htmlPath = path.join(this.traceDir, 'trace-viewer.html');
            const htmlContent = generateTraceViewer(this.traceData, this.options);
            fs.writeFileSync(htmlPath, htmlContent);

            console.log(`\n📊 Trace viewer: ${htmlPath}`);
        }
    }

    async onComplete(): Promise<void> {
        const traces = fs.readdirSync(this.outputDir)
            .filter((f: string) => f.startsWith('trace-') && fs.statSync(path.join(this.outputDir, f)).isDirectory());

        if (traces.length > 0) {
            const indexHtml = this.generateIndexPage(traces);
            fs.writeFileSync(path.join(this.outputDir, 'index.html'), indexHtml);
            console.log(`🔍 Trace index: ${path.join(this.outputDir, 'index.html')}`);
        }
    }

    // ========== Helper Methods ==========

    private shouldTraceCommand(commandName: string): boolean {
        return this.options.commandsToTrace.includes(commandName);
    }

    private getActionType(commandName: string): TraceAction['type'] {
        if (['url', 'navigateTo', 'back', 'forward', 'refresh'].includes(commandName)) return 'navigation';
        if (['waitForDisplayed', 'waitForEnabled', 'waitForExist', 'waitForClickable', 'pause'].includes(commandName)) return 'wait';
        return 'action';
    }

    private extractSelector(args: any[]): string | null {
        if (args.length === 0) return null;
        const first = args[0];
        if (typeof first === 'string') return first;
        if (first?.selector) return first.selector;
        return null;
    }

    private extractValue(commandName: string, args: any[]): string | undefined {
        if (['setValue', 'addValue', 'selectByVisibleText', 'url', 'navigateTo'].includes(commandName)) {
            const valueArg = commandName === 'url' || commandName === 'navigateTo' ? args[0] : args[1];
            if (typeof valueArg === 'string') return valueArg;
            if (Array.isArray(valueArg)) return valueArg.join('');
        }
        return undefined;
    }

    /**
     * Capture a screenshot with element highlighting
     * This captures the actual visual state of the page with highlighted element
     */
    private async captureScreenshot(phase: 'before' | 'after', selector: string | null): Promise<string | undefined> {
        if (!this._browser || !this.options.screenshots) return undefined;
        
        try {
            const browser = this._browser as any;
            
            // If we have a selector and it's the "before" phase, highlight the element
            if (selector && phase === 'before') {
                try {
                    await browser.execute((sel: string, color: string) => {
                        const el = document.querySelector(sel);
                        if (el) {
                            // Store original styles
                            (el as any).__originalOutline = (el as HTMLElement).style.outline;
                            (el as any).__originalBackground = (el as HTMLElement).style.background;
                            // Apply highlight
                            (el as HTMLElement).style.outline = '3px solid red';
                            (el as HTMLElement).style.background = color;
                        }
                    }, selector, this.options.highlightColor);
                } catch {
                    // Element not found or not visible, continue without highlight
                }
            }

            // Take screenshot
            const screenshot = await browser.takeScreenshot();
            
            // Remove highlight after taking screenshot
            if (selector && phase === 'before') {
                try {
                    await browser.execute((sel: string) => {
                        const el = document.querySelector(sel);
                        if (el) {
                            (el as HTMLElement).style.outline = (el as any).__originalOutline || '';
                            (el as HTMLElement).style.background = (el as any).__originalBackground || '';
                        }
                    }, selector);
                } catch {
                    // Ignore cleanup errors
                }
            }

            // Save screenshot
            const name = `screenshot-${Date.now()}-${phase}.png`;
            const filePath = path.join(this.traceDir, 'snapshots', name);
            fs.writeFileSync(filePath, screenshot, 'base64');
            
            return `snapshots/${name}`;
        } catch {
            return undefined;
        }
    }

    /**
     * Capture DOM snapshot - full HTML with base URL so resources load correctly
     */
    private async captureDOMSnapshot(phase: 'before' | 'after', selector: string | null): Promise<string | undefined> {
        if (!this._browser) return undefined;

        try {
            const browser = this._browser as any;
            
            // Execute script to capture full HTML with base URL for resource loading
            const htmlContent = await browser.execute((
                highlightSelector: string | null, 
                highlightColor: string,
                snapshotPhase: string
            ) => {
                // Get the base URL for resolving relative URLs
                const baseUrl = window.location.href;
                
                // Clone the document
                const clone = document.documentElement.cloneNode(true) as HTMLElement;
                
                // Add or update <base> tag so relative URLs work when viewing offline
                let head = clone.querySelector('head');
                if (!head) {
                    head = document.createElement('head');
                    clone.insertBefore(head, clone.firstChild);
                }
                
                // Remove any existing base tag and add our own
                const existingBase = head.querySelector('base');
                if (existingBase) existingBase.remove();
                
                const baseTag = document.createElement('base');
                baseTag.href = baseUrl;
                head.insertBefore(baseTag, head.firstChild);
                
                // Capture form values
                const originalInputs = document.querySelectorAll('input, textarea, select');
                const clonedInputs = clone.querySelectorAll('input, textarea, select');
                originalInputs.forEach((original, index) => {
                    const cloned = clonedInputs[index];
                    if (!cloned) return;
                    
                    if (original instanceof HTMLInputElement) {
                        if (original.type === 'checkbox' || original.type === 'radio') {
                            if (original.checked) {
                                cloned.setAttribute('checked', 'checked');
                            } else {
                                cloned.removeAttribute('checked');
                            }
                        } else {
                            cloned.setAttribute('value', original.value);
                        }
                    } else if (original instanceof HTMLTextAreaElement) {
                        (cloned as HTMLTextAreaElement).textContent = original.value;
                    } else if (original instanceof HTMLSelectElement) {
                        const options = cloned.querySelectorAll('option');
                        options.forEach((opt, i) => {
                            if (i === original.selectedIndex) {
                                opt.setAttribute('selected', 'selected');
                            } else {
                                opt.removeAttribute('selected');
                            }
                        });
                    }
                });
                
                // Highlight target element if specified
                if (highlightSelector && snapshotPhase === 'before') {
                    const targetInClone = clone.querySelector(highlightSelector);
                    if (targetInClone) {
                        (targetInClone as HTMLElement).style.outline = '3px solid #ff0000';
                        (targetInClone as HTMLElement).style.outlineOffset = '2px';
                        (targetInClone as HTMLElement).style.background = highlightColor;
                        (targetInClone as HTMLElement).setAttribute('data-trace-highlight', 'true');
                    }
                }
                
                // Get doctype
                const doctype = document.doctype 
                    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ''}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ''}>`
                    : '<!DOCTYPE html>';
                
                return doctype + '\n' + clone.outerHTML;
            }, selector, this.options.highlightColor, phase);

            // Save DOM snapshot
            const name = `dom-${Date.now()}-${phase}.html`;
            const filePath = path.join(this.traceDir, 'snapshots', name);
            fs.writeFileSync(filePath, htmlContent, 'utf-8');
            
            return `snapshots/${name}`;
        } catch {
            return undefined;
        }
    }

    private async getPageInfo(): Promise<{ url: string; title: string }> {
        if (!this._browser) return { url: '', title: '' };
        try {
            const browser = this._browser as any;
            const url = await browser.getUrl();
            const title = await browser.getTitle();
            return { url, title };
        } catch {
            return { url: '', title: '' };
        }
    }

    private async getTargetElementInfo(selector: string | null): Promise<TraceAction['targetElement'] | undefined> {
        if (!this._browser || !selector) return undefined;

        try {
            const browser = this._browser as any;
            const element = await browser.$(selector);
            if (!element || !(await element.isExisting())) return undefined;

            const tagName = await element.getTagName();
            const id = await element.getAttribute('id');
            const className = await element.getAttribute('class');
            
            let textContent = '';
            let inputValue = '';
            
            try {
                // Get text content
                textContent = (await element.getText()).substring(0, 100);
            } catch { /* ignore */ }
            
            try {
                // Get input value for form elements
                const tagLower = tagName.toLowerCase();
                if (['input', 'textarea', 'select'].includes(tagLower)) {
                    inputValue = await element.getValue() || '';
                }
            } catch { /* ignore */ }

            let boundingBox;
            try {
                const location = await element.getLocation();
                const size = await element.getSize();
                boundingBox = { x: location.x, y: location.y, width: size.width, height: size.height };
            } catch { /* ignore */ }

            return {
                selector,
                tagName,
                id: id || undefined,
                className: className || undefined,
                textContent: textContent || undefined,
                inputValue: inputValue || undefined,
                boundingBox
            };
        } catch {
            return undefined;
        }
    }

    /**
     * Calculate click point coordinates for an element
     * Returns center of element (viewport-relative) like Playwright
     */
    private async getClickPoint(
        selector: string | null,
        targetElement?: TraceAction['targetElement']
    ): Promise<{ x: number; y: number } | undefined> {
        if (!this._browser || !selector) return undefined;

        try {
            // Use bounding box if already calculated
            if (targetElement?.boundingBox) {
                const { x, y, width, height } = targetElement.boundingBox;
                return {
                    x: Math.round(x + width / 2),
                    y: Math.round(y + height / 2)
                };
            }

            // Otherwise calculate from element
            const browser = this._browser as any;
            const element = await browser.$(selector);
            if (!element || !(await element.isExisting())) return undefined;

            const location = await element.getLocation();
            const size = await element.getSize();
            
            return {
                x: Math.round(location.x + size.width / 2),
                y: Math.round(location.y + size.height / 2)
            };
        } catch {
            return undefined;
        }
    }

    private async getViewport(browser: WebdriverIO.Browser): Promise<{ width: number; height: number }> {
        try {
            const size = await (browser as any).getWindowSize();
            return { width: size.width, height: size.height };
        } catch {
            return { width: 1920, height: 1080 };
        }
    }

    private async getUserAgent(browser: WebdriverIO.Browser): Promise<string> {
        try {
            return await (browser as any).execute(() => navigator.userAgent);
        } catch {
            return '';
        }
    }

    private async setupConsoleCapture(browser: WebdriverIO.Browser): Promise<void> {
        try {
            // Use WebdriverIO BiDi events for console capture (WDIO v9+)
            const browserAny = browser as any;
            
            // BiDi log events
            browserAny.on('log.entryAdded', (event: any) => {
                if (this.traceData && event) {
                    const entry: ConsoleEntry = {
                        timestamp: Date.now(),
                        type: (event.level || event.type || 'log') as ConsoleEntry['type'],
                        message: event.text || event.args?.map((a: any) => a.value).join(' ') || '',
                        location: event.source?.url
                    };
                    this.traceData.consoleLogs.push(entry);
                }
            });
        } catch { 
            // BiDi events not available, try fallback
            console.log('[TraceService] Console capture via BiDi not available');
        }
    }

    private async setupNetworkCapture(browser: WebdriverIO.Browser): Promise<void> {
        try {
            const browserAny = browser as any;
            const pendingRequests = new Map<string, NetworkEntry>();
            const requestToAction = new Map<string, string>();
            let dataCollectorId: string | null = null;

            // Try to set up a data collector to capture response bodies using raw BiDi command
            // (network.addDataCollector is not yet exposed in WDIO's BiDi API)
            try {
                console.log('[TraceService] Attempting to set up network data collector...');
                const result = await browserAny.send?.({
                    method: 'network.addDataCollector',
                    params: {
                        dataTypes: ['response'],
                        maxEncodedDataSize: 10 * 1024 * 1024 // 10MB max
                    }
                });
                // browser.send() wraps result: {id, result: {collector: "..."}, type: "success"}
                const collectorId = result?.result?.collector || result?.collector;
                if (collectorId) {
                    dataCollectorId = collectorId;
                    console.log('[TraceService] Network data collector enabled, ID:', dataCollectorId);
                } else {
                    console.log('[TraceService] No collector ID returned, result:', JSON.stringify(result));
                }
            } catch (e) {
                // Data collector not supported in this browser/WDIO version
                console.log('[TraceService] Data collector setup failed:', e);
            }

            console.log('[TraceService] Setting up network events, dataCollectorId=', dataCollectorId);

            // BiDi network events
            browserAny.on('network.beforeRequestSent', (event: any) => {
                if (this.traceData && event?.request) {
                    const requestId = event.request.request || event.context + '-' + Date.now();
                    const entry: NetworkEntry = {
                        id: requestId,
                        timestamp: Date.now(),
                        method: event.request.method || 'GET',
                        url: event.request.url || '',
                        resourceType: event.initiator?.type || 'other',
                        timing: {
                            startTime: Date.now()
                        }
                    };
                    
                    // Capture request headers
                    if (Array.isArray(event.request.headers)) {
                        entry.requestHeaders = {};
                        for (const h of event.request.headers) {
                            if (h.name) {
                                const value = typeof h.value === 'object' && h.value?.value 
                                    ? h.value.value 
                                    : (h.value ?? '');
                                entry.requestHeaders[h.name] = String(value);
                            }
                        }
                    }
                    
                    // Capture request body if available
                    if (event.request.bodyData) {
                        try {
                            const bodyValue = typeof event.request.bodyData === 'object' && event.request.bodyData.value
                                ? event.request.bodyData.value
                                : event.request.bodyData;
                            entry.requestBody = String(bodyValue);
                            entry.requestBodySize = entry.requestBody.length;
                        } catch (e) {
                            entry.requestBody = '[Binary data]';
                        }
                    }
                    
                    // Capture initiator info
                    if (event.initiator) {
                        entry.initiator = {
                            type: event.initiator.type || 'other',
                            url: event.initiator.request?.url,
                            lineNumber: event.initiator.lineNumber
                        };
                    }
                    
                    // Capture cookies
                    if (event.request.cookies && Array.isArray(event.request.cookies)) {
                        entry.cookies = event.request.cookies.map((c: any) => ({
                            name: c.name,
                            value: typeof c.value === 'object' && c.value?.value ? c.value.value : String(c.value ?? ''),
                            domain: c.domain,
                            path: c.path
                        }));
                    }
                    
                    pendingRequests.set(requestId, entry);
                    this.traceData.networkLogs.push(entry);
                    
                    // Associate with current pending action
                    const actionId = this.pendingAction?.id || null;
                    if (actionId) {
                        requestToAction.set(requestId, actionId);
                        const action = this.pendingAction!;
                        action.network = action.network || [];
                        action.network.push(entry);
                    }
                }
            });

            browserAny.on('network.responseCompleted', (event: any) => {
                if (event?.request) {
                    const requestId = event.request.request || '';
                    const entry = pendingRequests.get(requestId);
                    if (entry) {
                        entry.status = event.response?.status;
                        entry.statusText = event.response?.statusText;
                        entry.mimeType = event.response?.mimeType;
                        entry.duration = Date.now() - entry.timestamp;
                        
                        // Update timing
                        if (entry.timing) {
                            entry.timing.responseEnd = Date.now();
                            entry.timing.responseStart = event.response?.responseTime 
                                ? entry.timing.startTime + event.response.responseTime
                                : Date.now() - 50; // Approximate
                        }
                        
                        // Capture size
                        const headers = event.response?.headers || [];
                        const contentLength = headers.find((h: any) => 
                            h.name?.toLowerCase() === 'content-length'
                        );
                        if (contentLength) {
                            const sizeValue = typeof contentLength.value === 'object' && contentLength.value?.value
                                ? contentLength.value.value
                                : contentLength.value;
                            entry.size = parseInt(String(sizeValue)) || 0;
                        }
                        
                        // Capture response headers
                        if (Array.isArray(event.response?.headers)) {
                            entry.responseHeaders = {};
                            for (const h of event.response.headers) {
                                if (h.name) {
                                    const value = typeof h.value === 'object' && h.value?.value 
                                        ? h.value.value 
                                        : (h.value ?? '');
                                    entry.responseHeaders[h.name] = String(value);
                                }
                            }
                        }
                        
                        console.log(`[TraceService] responseCompleted for ${entry.url}, dataCollectorId=${dataCollectorId}`);
                        
                        // Capture response body if data collector is available
                        if (dataCollectorId) {
                            // Try to get response body via data collector (async)
                            const reqId = requestId;
                            console.log(`[TraceService] Will try network.getData for request: ${reqId}`);
                            (async () => {
                                try {
                                    console.log(`[TraceService] Trying network.getData for request: ${reqId}`);
                                    const bodyData = await browserAny.send?.({
                                        method: 'network.getData',
                                        params: {
                                            dataType: 'response',
                                            collector: dataCollectorId,
                                            request: reqId
                                        }
                                    });
                                    // browser.send() wraps result: {id, result: {bytes: {...}}, type: "success"}
                                    const bytes = bodyData?.result?.bytes || bodyData?.bytes;
                                    console.log(`[TraceService] network.getData result type:`, bytes?.type || 'none');
                                    if (bytes) {
                                        // Body data returned as BytesValue (string or base64)
                                        if (bytes.type === 'string') {
                                            entry.responseBody = bytes.value;
                                            entry.responseBodySize = bytes.value.length;
                                        } else if (bytes.type === 'base64') {
                                            // Keep full base64 for binary data (images, etc.)
                                            entry.responseBody = `[base64]${bytes.value}`;
                                            entry.responseBodySize = Math.round(bytes.value.length * 0.75); // Approximate decoded size
                                        }
                                    }
                                } catch (e) {
                                    console.log(`[TraceService] network.getData error:`, e);
                                }
                            })();
                        }
                        
                        // Capture size from content metadata (always available)
                        if (event.response?.content) {
                            const content = event.response.content;
                            if (typeof content === 'object' && content !== null) {
                                if (content.size !== undefined) {
                                    entry.responseBodySize = content.size;
                                }
                            }
                        }
                    }
                }
            });
        } catch {
            console.log('[TraceService] Network capture via BiDi not available');
        }
    }

    private generateIndexPage(traces: string[]): string {
        const traceLinks = traces.map(trace => {
            const tracePath = path.join(trace, 'trace-viewer.html');
            const traceJsonPath = path.join(this.outputDir, trace, 'trace.json');
            let traceInfo = { testName: trace, startTime: 0, endTime: 0, scenarios: [] as any[] };
            
            try {
                traceInfo = JSON.parse(fs.readFileSync(traceJsonPath, 'utf-8'));
            } catch { /* defaults */ }

            const status = traceInfo.scenarios.every((s: any) => s.status === 'passed') ? 'passed' : 'failed';
            const duration = traceInfo.endTime && traceInfo.startTime 
                ? ((traceInfo.endTime - traceInfo.startTime) / 1000).toFixed(1) + 's' 
                : '';
            
            return `<a href="${tracePath}" class="trace-item ${status}">
                <span class="status-icon">${status === 'passed' ? '✓' : '✗'}</span>
                <span class="trace-name">${traceInfo.testName || trace}</span>
                <span class="trace-duration">${duration}</span>
            </a>`;
        }).join('');

        return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Trace Viewer</title>
<style>
body { font-family: system-ui; background: #1e1e1e; color: #ccc; margin: 0; padding: 20px; }
h1 { color: #fff; font-size: 18px; }
.trace-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #2d2d2d; border-radius: 6px; margin: 8px 0; text-decoration: none; color: inherit; }
.trace-item:hover { background: #363636; }
.trace-item.passed .status-icon { color: #4ec9b0; }
.trace-item.failed .status-icon { color: #f14c4c; }
.trace-name { flex: 1; }
.trace-duration { color: #888; font-size: 12px; }
</style></head>
<body><h1>📊 Trace Viewer</h1>${traceLinks}</body></html>`;
    }
}
