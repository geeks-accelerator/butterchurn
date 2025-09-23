/**
 * Moving Average Crossover System for Music Visualization
 * Based on comprehensive MA research from financial markets
 * Optimized for real-time audio signal processing
 */

/**
 * Simple Moving Average - O(1) optimized with circular buffer
 */
class SMA {
    constructor(period) {
        this.period = period;
        this.values = new Array(period).fill(0);
        this.index = 0;
        this.sum = 0;
        this.filled = false;
    }

    update(value) {
        // Remove oldest value from sum
        this.sum -= this.values[this.index];
        // Add new value
        this.values[this.index] = value;
        this.sum += value;
        // Move to next position
        this.index = (this.index + 1) % this.period;

        if (this.index === 0) this.filled = true;

        const count = this.filled ? this.period : Math.max(1, this.index || this.period);
        return this.sum / count;
    }

    reset() {
        this.values.fill(0);
        this.index = 0;
        this.sum = 0;
        this.filled = false;
    }
}

/**
 * Exponential Moving Average - O(1) with smoothing factor
 */
class EMA {
    constructor(period) {
        this.period = period;
        this.alpha = 2 / (period + 1);
        this.value = null;
        this.warmup = 0;
    }

    update(value) {
        if (this.value === null) {
            this.value = value;
        } else {
            this.value = this.alpha * value + (1 - this.alpha) * this.value;
        }
        this.warmup++;
        return this.value;
    }

    isWarmedUp() {
        return this.warmup >= this.period * 2;
    }

    reset() {
        this.value = null;
        this.warmup = 0;
    }
}

/**
 * Double Exponential Moving Average - Reduces lag
 */
class DEMA {
    constructor(period) {
        this.period = period;
        this.ema1 = new EMA(period);
        this.ema2 = new EMA(period);
    }

    update(value) {
        const ema1Value = this.ema1.update(value);
        const ema2Value = this.ema2.update(ema1Value);
        return 2 * ema1Value - ema2Value;
    }

    isWarmedUp() {
        return this.ema1.isWarmedUp() && this.ema2.isWarmedUp();
    }

    reset() {
        this.ema1.reset();
        this.ema2.reset();
    }
}

/**
 * Hull Moving Average - Near zero lag
 * HMA = WMA(sqrt(n), [2×WMA(n/2) - WMA(n)])
 */
class HMA {
    constructor(period) {
        this.period = period;
        this.halfPeriod = Math.floor(period / 2);
        this.sqrtPeriod = Math.floor(Math.sqrt(period));

        this.wmaFull = new WMA(period);
        this.wmaHalf = new WMA(this.halfPeriod);
        this.wmaFinal = new WMA(this.sqrtPeriod);

        this.buffer = [];
    }

    update(value) {
        const wmaFullValue = this.wmaFull.update(value);
        const wmaHalfValue = this.wmaHalf.update(value);

        // 2 * WMA(n/2) - WMA(n)
        const rawHull = 2 * wmaHalfValue - wmaFullValue;

        // Final smoothing with WMA(sqrt(n))
        return this.wmaFinal.update(rawHull);
    }

    reset() {
        this.wmaFull.reset();
        this.wmaHalf.reset();
        this.wmaFinal.reset();
        this.buffer = [];
    }
}

/**
 * Weighted Moving Average - Linear weighting
 */
class WMA {
    constructor(period) {
        this.period = period;
        this.values = [];
        this.weightSum = (period * (period + 1)) / 2;
    }

    update(value) {
        this.values.push(value);
        if (this.values.length > this.period) {
            this.values.shift();
        }

        let weightedSum = 0;
        let actualWeightSum = 0;

        for (let i = 0; i < this.values.length; i++) {
            const weight = i + 1;
            weightedSum += this.values[i] * weight;
            actualWeightSum += weight;
        }

        return weightedSum / actualWeightSum;
    }

    reset() {
        this.values = [];
    }
}

/**
 * Arnaud Legoux Moving Average - Gaussian distribution
 * Simplified version for real-time performance
 */
class ALMA {
    constructor(period, offset = 0.85, sigma = 6) {
        this.period = period;
        this.offset = offset;
        this.sigma = sigma;
        this.values = [];

        // Pre-calculate weights
        this.weights = [];
        const m = Math.floor(offset * (period - 1));
        const s = period / sigma;

        for (let i = 0; i < period; i++) {
            const weight = Math.exp(-Math.pow(i - m, 2) / (2 * s * s));
            this.weights.push(weight);
        }

        // Normalize weights
        const weightSum = this.weights.reduce((a, b) => a + b, 0);
        this.weights = this.weights.map(w => w / weightSum);
    }

    update(value) {
        this.values.push(value);
        if (this.values.length > this.period) {
            this.values.shift();
        }

        if (this.values.length < this.period) {
            // Simple average during warmup
            return this.values.reduce((a, b) => a + b, 0) / this.values.length;
        }

        // Apply Gaussian weights
        let weightedSum = 0;
        for (let i = 0; i < this.values.length; i++) {
            weightedSum += this.values[i] * this.weights[i];
        }

        return weightedSum;
    }

    reset() {
        this.values = [];
    }
}

/**
 * Multi-Signal Crossover Detector
 * Manages multiple MA pairs for different audio characteristics
 */
class MultiSignalCrossover {
    constructor(config = {}) {
        // Energy detection (primary signal)
        this.energy = {
            fast: new DEMA(config.energyFast || 5),
            slow: new EMA(config.energySlow || 20),
            weight: config.energyWeight || 0.5,
            status: 'stable',
            lastCross: 0
        };

        // Bass detection (secondary signal)
        this.bass = {
            fast: new EMA(config.bassFast || 3),
            slow: new SMA(config.bassSlow || 15),
            weight: config.bassWeight || 0.3,
            status: 'stable',
            lastCross: 0
        };

        // Treble detection (tertiary signal)
        this.treble = {
            fast: new HMA(config.trebleFast || 7),
            slow: new ALMA(config.trebleSlow || 25),
            weight: config.trebleWeight || 0.2,
            status: 'stable',
            lastCross: 0
        };

        // Crossover detection settings
        this.minCrossoverGap = config.minCrossoverGap || 2000; // 2 seconds
        this.signalThreshold = config.signalThreshold || 0.4;
        this.consensusRequired = config.consensusRequired || 2; // 2/3 signals

        // History for debugging
        this.history = [];
        this.maxHistory = 100;
    }

    /**
     * Update all signals and detect crossovers
     */
    update(audioFeatures) {
        const now = Date.now();
        const signals = [];

        // Update energy signal
        if (typeof audioFeatures.energy === 'number') {
            const energyFast = this.energy.fast.update(audioFeatures.energy);
            const energySlow = this.energy.slow.update(audioFeatures.energy);

            const newStatus = this.detectCrossover(
                energyFast,
                energySlow,
                this.energy.status,
                now - this.energy.lastCross
            );

            if (newStatus !== this.energy.status) {
                this.energy.lastCross = now;
                this.energy.status = newStatus;
                signals.push({ type: 'energy', status: newStatus });
            }
        }

        // Update bass signal
        if (typeof audioFeatures.bassEnergy === 'number') {
            const bassFast = this.bass.fast.update(audioFeatures.bassEnergy);
            const bassSlow = this.bass.slow.update(audioFeatures.bassEnergy);

            const newStatus = this.detectCrossover(
                bassFast,
                bassSlow,
                this.bass.status,
                now - this.bass.lastCross
            );

            if (newStatus !== this.bass.status) {
                this.bass.lastCross = now;
                this.bass.status = newStatus;
                signals.push({ type: 'bass', status: newStatus });
            }
        }

        // Update treble signal
        if (typeof audioFeatures.trebleEnergy === 'number') {
            const trebleFast = this.treble.fast.update(audioFeatures.trebleEnergy);
            const trebleSlow = this.treble.slow.update(audioFeatures.trebleEnergy);

            const newStatus = this.detectCrossover(
                trebleFast,
                trebleSlow,
                this.treble.status,
                now - this.treble.lastCross
            );

            if (newStatus !== this.treble.status) {
                this.treble.lastCross = now;
                this.treble.status = newStatus;
                signals.push({ type: 'treble', status: newStatus });
            }
        }

        // Calculate blended signal
        const blended = this.calculateBlendedSignal();

        // Store history for debugging
        this.history.push({
            timestamp: now,
            energy: this.energy.status,
            bass: this.bass.status,
            treble: this.treble.status,
            blended: blended.score,
            signals
        });

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        return {
            signals,
            blended,
            shouldSwitch: blended.shouldSwitch,
            switchReason: this.getReasonString(blended)
        };
    }

    /**
     * Detect crossover between fast and slow MAs
     */
    detectCrossover(fast, slow, currentStatus, timeSinceLastCross) {
        // Require minimum gap between crossovers to prevent whipsaws
        if (timeSinceLastCross < this.minCrossoverGap) {
            return currentStatus;
        }

        const diff = fast - slow;
        const threshold = slow * 0.01; // 1% threshold to prevent noise triggers

        if (currentStatus === 'golden' || currentStatus === 'stable') {
            // Check for death cross
            if (diff < -threshold) {
                return 'death';
            }
        }

        if (currentStatus === 'death' || currentStatus === 'stable') {
            // Check for golden cross
            if (diff > threshold) {
                return 'golden';
            }
        }

        return currentStatus;
    }

    /**
     * Calculate blended signal from all crossovers
     */
    calculateBlendedSignal() {
        let score = 0;
        let activeSignals = 0;

        // Weight each signal based on its status
        if (this.energy.status === 'golden') {
            score += this.energy.weight;
            activeSignals++;
        } else if (this.energy.status === 'death') {
            score -= this.energy.weight;
            activeSignals++;
        }

        if (this.bass.status === 'golden') {
            score += this.bass.weight;
            activeSignals++;
        } else if (this.bass.status === 'death') {
            score -= this.bass.weight;
            activeSignals++;
        }

        if (this.treble.status === 'golden') {
            score += this.treble.weight;
            activeSignals++;
        } else if (this.treble.status === 'death') {
            score -= this.treble.weight;
            activeSignals++;
        }

        // Determine if we should switch presets
        const shouldSwitch = Math.abs(score) > this.signalThreshold ||
                            activeSignals >= this.consensusRequired;

        return {
            score,
            activeSignals,
            shouldSwitch,
            direction: score > 0 ? 'energize' : score < 0 ? 'calm' : 'stable'
        };
    }

    /**
     * Get human-readable reason for switching
     */
    getReasonString(blended) {
        const reasons = [];

        if (this.energy.status === 'golden') reasons.push('Energy surge');
        if (this.energy.status === 'death') reasons.push('Energy drop');
        if (this.bass.status === 'golden') reasons.push('Bass surge');
        if (this.bass.status === 'death') reasons.push('Bass drop');
        if (this.treble.status === 'golden') reasons.push('Treble surge');
        if (this.treble.status === 'death') reasons.push('Treble drop');

        if (reasons.length === 0) {
            return blended.direction === 'stable' ? 'Stable' :
                   blended.direction === 'energize' ? 'Building energy' : 'Calming down';
        }

        return reasons.join(', ');
    }

    /**
     * Reset all MAs and signals
     */
    reset() {
        this.energy.fast.reset();
        this.energy.slow.reset();
        this.energy.status = 'stable';
        this.energy.lastCross = 0;

        this.bass.fast.reset();
        this.bass.slow.reset();
        this.bass.status = 'stable';
        this.bass.lastCross = 0;

        this.treble.fast.reset();
        this.treble.slow.reset();
        this.treble.status = 'stable';
        this.treble.lastCross = 0;

        this.history = [];
    }

    /**
     * Get current state for debugging
     */
    getDebugState() {
        return {
            energy: this.energy.status,
            bass: this.bass.status,
            treble: this.treble.status,
            lastSignal: this.history[this.history.length - 1],
            historySize: this.history.length
        };
    }
}

// Export classes
export {
    SMA,
    EMA,
    DEMA,
    HMA,
    WMA,
    ALMA,
    MultiSignalCrossover
};

export default MultiSignalCrossover;