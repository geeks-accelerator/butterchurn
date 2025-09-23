/**
 * Device Capabilities Detector
 * Detects hardware and browser capabilities for performance optimization
 */
export class DeviceCapabilities {
    /**
     * Detect all device capabilities
     * @returns {Object} Device capabilities
     */
    static async detect() {
        const capabilities = {
            memory: this.detectMemory(),
            cpu: this.detectCPU(),
            connection: this.detectConnection(),
            gpu: await this.detectGPU(),
            screen: this.detectScreen(),
            browser: this.detectBrowser()
        };

        // Calculate performance tier based on capabilities
        capabilities.tier = this.calculateTier(capabilities);

        return capabilities;
    }

    /**
     * Detect device memory
     * @returns {Object} Memory information
     */
    static detectMemory() {
        const memory = {
            available: navigator.deviceMemory || 'unknown',
            jsHeapLimit: null,
            jsHeapUsed: null
        };

        if (performance.memory) {
            memory.jsHeapLimit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
            memory.jsHeapUsed = Math.round(performance.memory.usedJSHeapSize / 1048576);
        }

        return memory;
    }

    /**
     * Detect CPU information
     * @returns {Object} CPU information
     */
    static detectCPU() {
        return {
            cores: navigator.hardwareConcurrency || 'unknown',
            // Estimate CPU speed based on cores (rough approximation)
            estimatedTier: navigator.hardwareConcurrency >= 8 ? 'high' :
                          navigator.hardwareConcurrency >= 4 ? 'medium' : 'low'
        };
    }

    /**
     * Detect network connection
     * @returns {Object} Connection information
     */
    static detectConnection() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

        if (!connection) {
            return { type: 'unknown', effectiveType: 'unknown' };
        }

        return {
            type: connection.type || 'unknown',
            effectiveType: connection.effectiveType || 'unknown',
            downlink: connection.downlink || 'unknown',
            rtt: connection.rtt || 'unknown',
            saveData: connection.saveData || false
        };
    }

    /**
     * Detect GPU capabilities
     * @returns {Promise<Object>} GPU information
     */
    static async detectGPU() {
        const gpu = {
            vendor: 'unknown',
            renderer: 'unknown',
            tier: 'unknown'
        };

        try {
            // Create temporary canvas for WebGL context
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') ||
                      canvas.getContext('experimental-webgl');

            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    gpu.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown';
                    gpu.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
                }

                // Get other WebGL capabilities
                gpu.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
                gpu.maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
                gpu.maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
                gpu.version = gl.getParameter(gl.VERSION);

                // Classify GPU tier based on renderer string and capabilities
                gpu.tier = this.classifyGPU(gpu);
            }
        } catch (error) {
            console.warn('GPU detection failed:', error);
        }

        return gpu;
    }

    /**
     * Detect screen capabilities
     * @returns {Object} Screen information
     */
    static detectScreen() {
        return {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth,
            devicePixelRatio: window.devicePixelRatio || 1,
            orientation: screen.orientation ? screen.orientation.type : 'unknown'
        };
    }

    /**
     * Detect browser information
     * @returns {Object} Browser information
     */
    static detectBrowser() {
        const ua = navigator.userAgent;
        const browser = {
            userAgent: ua,
            platform: navigator.platform,
            language: navigator.language,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            doNotTrack: navigator.doNotTrack
        };

        // Detect browser type
        if (ua.indexOf('Chrome') > -1) {
            browser.name = 'Chrome';
            const match = ua.match(/Chrome\/(\d+)/);
            browser.version = match ? match[1] : 'unknown';
        } else if (ua.indexOf('Firefox') > -1) {
            browser.name = 'Firefox';
            const match = ua.match(/Firefox\/(\d+)/);
            browser.version = match ? match[1] : 'unknown';
        } else if (ua.indexOf('Safari') > -1) {
            browser.name = 'Safari';
            const match = ua.match(/Version\/(\d+)/);
            browser.version = match ? match[1] : 'unknown';
        } else if (ua.indexOf('Edge') > -1) {
            browser.name = 'Edge';
            const match = ua.match(/Edge\/(\d+)/);
            browser.version = match ? match[1] : 'unknown';
        }

        return browser;
    }

    /**
     * Classify GPU tier based on capabilities and renderer string
     * @private
     */
    static classifyGPU(gpu) {
        const renderer = gpu.renderer.toLowerCase();

        // High-end GPUs
        if (renderer.includes('nvidia')) {
            if (renderer.includes('rtx') || renderer.includes('gtx 1080') ||
                renderer.includes('gtx 1070') || renderer.includes('gtx 1660')) {
                return 'high';
            }
            if (renderer.includes('gtx')) {
                return 'medium';
            }
        }

        if (renderer.includes('amd')) {
            if (renderer.includes('rx 6') || renderer.includes('rx 5')) {
                return 'high';
            }
            return 'medium';
        }

        // Apple GPUs
        if (renderer.includes('apple')) {
            if (renderer.includes('m1') || renderer.includes('m2') || renderer.includes('m3')) {
                return 'high';
            }
            return 'medium';
        }

        // Intel integrated graphics
        if (renderer.includes('intel')) {
            if (renderer.includes('iris')) {
                return 'medium';
            }
            return 'low';
        }

        // Mobile GPUs
        if (renderer.includes('adreno') || renderer.includes('mali') ||
            renderer.includes('powervr')) {
            if (renderer.includes('adreno 6') || renderer.includes('mali-g7')) {
                return 'medium';
            }
            return 'low';
        }

        // Fallback based on capabilities
        if (gpu.maxTextureSize >= 16384) {
            return 'high';
        } else if (gpu.maxTextureSize >= 8192) {
            return 'medium';
        }

        return 'low';
    }

    /**
     * Calculate overall device performance tier
     * @private
     */
    static calculateTier(capabilities) {
        let score = 0;
        let factors = 0;

        // Memory score
        if (capabilities.memory.available !== 'unknown') {
            factors++;
            if (capabilities.memory.available >= 8) score += 3;
            else if (capabilities.memory.available >= 4) score += 2;
            else score += 1;
        }

        // CPU score
        if (capabilities.cpu.cores !== 'unknown') {
            factors++;
            if (capabilities.cpu.cores >= 8) score += 3;
            else if (capabilities.cpu.cores >= 4) score += 2;
            else score += 1;
        }

        // GPU score
        if (capabilities.gpu.tier !== 'unknown') {
            factors++;
            if (capabilities.gpu.tier === 'high') score += 3;
            else if (capabilities.gpu.tier === 'medium') score += 2;
            else score += 1;
        }

        // Calculate average score
        const avgScore = factors > 0 ? score / factors : 1;

        if (avgScore >= 2.5) return 'high';
        if (avgScore >= 1.5) return 'medium';
        return 'low';
    }

    /**
     * Get recommended settings based on device tier
     * @param {string} tier - Device performance tier
     * @returns {Object} Recommended settings
     */
    static getRecommendedSettings(tier) {
        const settings = {
            high: {
                resolution: 1.0,
                fps: 60,
                meshWidth: 48,
                meshHeight: 36,
                textureSize: 1024,
                enableFXAA: true,
                maxPresetComplexity: 1.0,
                transitionTime: 5.0
            },
            medium: {
                resolution: 0.75,
                fps: 30,
                meshWidth: 32,
                meshHeight: 24,
                textureSize: 512,
                enableFXAA: false,
                maxPresetComplexity: 0.7,
                transitionTime: 3.0
            },
            low: {
                resolution: 0.5,
                fps: 30,
                meshWidth: 24,
                meshHeight: 18,
                textureSize: 256,
                enableFXAA: false,
                maxPresetComplexity: 0.5,
                transitionTime: 2.0
            }
        };

        return settings[tier] || settings.low;
    }
}

export default DeviceCapabilities;