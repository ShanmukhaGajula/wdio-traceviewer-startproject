/**
 * Types for WDIO Trace Viewer - Playwright-compatible
 */

export interface TraceAction {
    id: string;
    timestamp: number;
    wallTime: number;
    type: 'action' | 'navigation' | 'wait' | 'assertion';
    category: 'click' | 'fill' | 'navigate' | 'select' | 'keyboard' | 'wait' | 'scroll' | 'assertion' | 'other';
    name: string;
    selector?: string;
    value?: string;
    duration?: number;
    
    // Screenshots with element highlighting baked in
    beforeSnapshot?: string;
    afterSnapshot?: string;
    
    // DOM snapshots (HTML source)
    beforeDOM?: string;
    afterDOM?: string;
    
    // Page state
    pageUrl?: string;
    pageTitle?: string;
    
    // Target element info for display
    targetElement?: {
        selector: string;
        tagName: string;
        id?: string;
        className?: string;
        textContent?: string;
        inputValue?: string;
        boundingBox?: { x: number; y: number; width: number; height: number };
    };
    
    // Click point coordinates (relative to viewport)
    clickPoint?: {
        x: number;
        y: number;
    };
    
    // Log entries during this action
    logs?: Array<{
        type: 'log' | 'info' | 'warn' | 'error';
        message: string;
        timestamp: number;
    }>;
    
    // Network requests associated with this action
    network?: NetworkEntry[];
    
    error?: string;
    status: 'passed' | 'failed' | 'pending';
}

export interface ConsoleEntry {
    timestamp: number;
    type: 'log' | 'info' | 'warn' | 'error' | 'debug';
    message: string;
    location?: string;
    args?: string[];
}

export interface NetworkEntry {
    id: string;
    timestamp: number;
    method: string;
    url: string;
    status?: number;
    statusText?: string;
    duration?: number;
    resourceType?: string;
    size?: number;
    mimeType?: string;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBodySize?: number;
    responseBodySize?: number;
    requestBody?: string;
    responseBody?: string;
    // Detailed timing breakdown (like Chrome DevTools)
    timing?: {
        startTime: number;
        redirectStart?: number;
        redirectEnd?: number;
        fetchStart?: number;
        dnsStart?: number;
        dnsEnd?: number;
        connectStart?: number;
        connectEnd?: number;
        sslStart?: number;
        sslEnd?: number;
        requestStart?: number;
        responseStart?: number;
        responseEnd?: number;
    };
    cookies?: Array<{
        name: string;
        value: string;
        domain?: string;
        path?: string;
    }>;
    initiator?: {
        type: string;
        url?: string;
        lineNumber?: number;
    };
}

export interface TraceStep {
    id: string;
    name: string;
    keyword: string;
    startTime: number;
    endTime?: number;
    status: 'passed' | 'failed' | 'pending';
    error?: string;
    actions: TraceAction[];
    location?: { file: string; line: number };
}

export interface TraceScenario {
    id: string;
    name: string;
    feature: string;
    featureFile?: string;
    tags?: string[];
    startTime: number;
    endTime?: number;
    status: 'passed' | 'failed' | 'pending';
    steps: TraceStep[];
}

export interface TraceData {
    version: string;
    testName: string;
    browser: string;
    browserVersion?: string;
    platform: string;
    startTime: number;
    endTime?: number;
    scenarios: TraceScenario[];
    consoleLogs: ConsoleEntry[];
    networkLogs: NetworkEntry[];
    metadata: {
        wdioVersion?: string;
        baseUrl?: string;
        viewport?: { width: number; height: number };
        userAgent?: string;
    };
}

export interface TraceServiceOptions {
    outputDir?: string;
    screenshots?: boolean;
    snapshots?: boolean;
    consoleLogs?: boolean;
    network?: boolean;
    maxSnapshots?: number;
    highlightColor?: string;
    commandsToTrace?: string[];
}
