/**
 * BlocklistManager - User interface and controls for managing preset blocklists
 *
 * Provides:
 * - View current blocklist
 * - Remove presets from blocklist
 * - Import/export blocklists
 * - Clear blocklist
 * - Statistics and reporting
 */

import { presetLogger } from '../analysis/presetFailureLogger.js';
import { config } from '../config/config.js';

export class BlocklistManager {
  constructor() {
    this.logger = presetLogger;
    this.uiContainer = null;
    this.isVisible = false;
  }

  /**
   * Initialize UI controls (call after DOM ready)
   */
  initializeUI(containerId = 'butterchurn-blocklist-manager') {
    // Check if container exists
    let container = document.getElementById(containerId);

    if (!container) {
      // Create container if it doesn't exist
      container = document.createElement('div');
      container.id = containerId;
      container.className = 'butterchurn-blocklist-manager';
      document.body.appendChild(container);
    }

    this.uiContainer = container;
    this.createUI();
    this.attachEventHandlers();

    // Hide by default
    this.hide();
  }

  /**
   * Create the UI elements
   */
  createUI() {
    this.uiContainer.innerHTML = `
      <div class="blocklist-panel">
        <div class="blocklist-header">
          <h3>Preset Blocklist Manager</h3>
          <button class="close-btn" data-action="close">×</button>
        </div>

        <div class="blocklist-tabs">
          <button class="tab-btn active" data-tab="overview">Overview</button>
          <button class="tab-btn" data-tab="permanent">Permanent</button>
          <button class="tab-btn" data-tab="conditional">Conditional</button>
          <button class="tab-btn" data-tab="settings">Settings</button>
        </div>

        <div class="blocklist-content">
          <!-- Overview Tab -->
          <div class="tab-content active" id="tab-overview">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value" id="stat-permanent">0</div>
                <div class="stat-label">Permanent Blocks</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="stat-conditional">0</div>
                <div class="stat-label">Conditional Blocks</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="stat-failures">0</div>
                <div class="stat-label">Total Failures</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="stat-sessions">0</div>
                <div class="stat-label">Sessions Logged</div>
              </div>
            </div>

            <div class="actions-row">
              <button class="action-btn" data-action="export">Export Blocklist</button>
              <button class="action-btn" data-action="import">Import Blocklist</button>
              <button class="action-btn danger" data-action="clear">Clear All</button>
            </div>

            <input type="file" id="import-file" style="display: none" accept=".json">
          </div>

          <!-- Permanent Blocklist Tab -->
          <div class="tab-content" id="tab-permanent">
            <div class="blocklist-controls">
              <input type="text" id="search-permanent" placeholder="Search presets...">
              <button class="btn-small" data-action="refresh-permanent">Refresh</button>
            </div>
            <div class="blocklist-items" id="permanent-list">
              <!-- Populated dynamically -->
            </div>
          </div>

          <!-- Conditional Blocklist Tab -->
          <div class="tab-content" id="tab-conditional">
            <div class="condition-selector">
              <label>
                <input type="radio" name="condition" value="mobile" checked>
                Mobile
              </label>
              <label>
                <input type="radio" name="condition" value="low_memory">
                Low Memory
              </label>
              <label>
                <input type="radio" name="condition" value="integrated_gpu">
                Integrated GPU
              </label>
            </div>
            <div class="blocklist-items" id="conditional-list">
              <!-- Populated dynamically -->
            </div>
          </div>

          <!-- Settings Tab -->
          <div class="tab-content" id="tab-settings">
            <div class="settings-form">
              <div class="setting-group">
                <label for="auto-blocklist">
                  <input type="checkbox" id="auto-blocklist" checked>
                  Enable Auto-Blocklist
                </label>
                <small>Automatically block presets with high failure rates</small>
              </div>

              <div class="setting-group">
                <label for="failure-threshold">
                  Failure Rate Threshold
                  <input type="number" id="failure-threshold" min="0" max="100" value="80">
                  <span>%</span>
                </label>
                <small>Block presets when failure rate exceeds this</small>
              </div>

              <div class="setting-group">
                <label for="failure-count">
                  Failure Count Threshold
                  <input type="number" id="failure-count" min="1" max="1000" value="50">
                </label>
                <small>Block presets after this many failures</small>
              </div>

              <div class="setting-group">
                <label for="debug-mode">
                  <input type="checkbox" id="debug-mode">
                  Debug Mode
                </label>
                <small>Show detailed failure information</small>
              </div>

              <button class="action-btn" data-action="save-settings">Save Settings</button>
            </div>
          </div>
        </div>
      </div>

      <style>
        .butterchurn-blocklist-manager {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .blocklist-panel {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          width: 600px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .blocklist-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .blocklist-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 30px;
          height: 30px;
        }

        .blocklist-tabs {
          display: flex;
          border-bottom: 1px solid #e0e0e0;
          padding: 0 20px;
        }

        .tab-btn {
          background: none;
          border: none;
          padding: 12px 16px;
          cursor: pointer;
          font-size: 14px;
          color: #666;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }

        .tab-btn.active {
          color: #007AFF;
          border-bottom-color: #007AFF;
        }

        .blocklist-content {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        .tab-content {
          display: none;
        }

        .tab-content.active {
          display: block;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: #f5f5f5;
          padding: 16px;
          border-radius: 6px;
          text-align: center;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 600;
          color: #333;
        }

        .stat-label {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }

        .actions-row {
          display: flex;
          gap: 10px;
        }

        .action-btn {
          flex: 1;
          padding: 10px 16px;
          background: #007AFF;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }

        .action-btn:hover {
          background: #0051D5;
        }

        .action-btn.danger {
          background: #FF3B30;
        }

        .action-btn.danger:hover {
          background: #D70015;
        }

        .blocklist-items {
          max-height: 300px;
          overflow-y: auto;
          margin-top: 16px;
        }

        .blocklist-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f9f9f9;
          margin-bottom: 8px;
          border-radius: 4px;
        }

        .blocklist-item-hash {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #666;
        }

        .blocklist-item-stats {
          font-size: 11px;
          color: #999;
        }

        .remove-btn {
          background: #FF3B30;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
        }

        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .setting-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .setting-group label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .setting-group small {
          font-size: 12px;
          color: #666;
          margin-left: 24px;
        }

        .setting-group input[type="number"] {
          width: 60px;
          padding: 4px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .hidden {
          display: none !important;
        }
      </style>
    `;

    // Add accessibility attributes after UI creation
    this.addAccessibilityAttributes();
  }

  /**
   * Add ARIA attributes for accessibility compliance
   */
  addAccessibilityAttributes() {
    // Tab list attributes
    const tabsContainer = this.uiContainer.querySelector('.blocklist-tabs');
    if (tabsContainer) {
      tabsContainer.setAttribute('role', 'tablist');
      tabsContainer.setAttribute('aria-label', 'Blocklist management sections');
    }

    // Tab button attributes
    this.uiContainer.querySelectorAll('.tab-btn').forEach((tab, index) => {
      const tabId = tab.dataset.tab;
      const panelId = `tab-${tabId}`;

      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panelId);
      tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
      tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
      tab.id = `tab-btn-${tabId}`;

      // Add keyboard navigation
      tab.addEventListener('keydown', (e) => {
        this.handleTabKeydown(e, index);
      });
    });

    // Tab panel attributes
    this.uiContainer.querySelectorAll('.tab-content').forEach((panel) => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `tab-btn-${panel.id.replace('tab-', '')}`);
      panel.setAttribute('tabindex', '0');
    });

    // Form controls - ensure accessible labels
    this.uiContainer.querySelectorAll('input, button').forEach((control) => {
      if (!control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) {
        const label = control.closest('label');
        if (label && !control.id) {
          const id = `control-${Math.random().toString(36).substr(2, 9)}`;
          control.id = id;
        }
      }
    });

    // Live regions for dynamic content
    const statsValues = this.uiContainer.querySelectorAll('.stat-value');
    statsValues.forEach((stat) => {
      stat.setAttribute('aria-live', 'polite');
      stat.setAttribute('aria-atomic', 'true');
    });

    // Lists for screen readers
    const lists = this.uiContainer.querySelectorAll('.blocklist-items');
    lists.forEach((list) => {
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', 'Blocked presets');
    });

    // Close button
    const closeBtn = this.uiContainer.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', 'Close blocklist manager');
    }
  }

  /**
   * Handle keyboard navigation for tabs
   */
  handleTabKeydown(event, currentIndex) {
    const tabs = Array.from(this.uiContainer.querySelectorAll('.tab-btn'));
    let newIndex = currentIndex;

    switch (event.key) {
      case 'ArrowLeft':
        newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        break;
      case 'ArrowRight':
        newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = tabs.length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.switchTab(tabs[currentIndex].dataset.tab);
        return;
      default:
        return;
    }

    event.preventDefault();
    tabs[newIndex].focus();
    this.switchTab(tabs[newIndex].dataset.tab);
  }

  /**
   * Attach event handlers
   */
  attachEventHandlers() {
    // Tab switching
    this.uiContainer.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Action buttons
    this.uiContainer.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
        this.handleAction(action, e.target);
      }
    });

    // Import file input
    const importInput = this.uiContainer.querySelector('#import-file');
    importInput.addEventListener('change', (e) => {
      this.handleImport(e.target.files[0]);
    });

    // Condition selector for conditional tab
    this.uiContainer.querySelectorAll('input[name="condition"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        this.loadConditionalList();
      });
    });

    // Search
    const searchInput = this.uiContainer.querySelector('#search-permanent');
    searchInput.addEventListener('input', (e) => {
      this.filterPermanentList(e.target.value);
    });
  }

  /**
   * Switch tabs with accessibility updates
   */
  switchTab(tabName) {
    // Update tab buttons with ARIA attributes
    this.uiContainer.querySelectorAll('.tab-btn').forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // Update tab content
    this.uiContainer.querySelectorAll('.tab-content').forEach((content) => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Load data for the tab
    if (tabName === 'permanent') {
      this.loadPermanentList();
    } else if (tabName === 'conditional') {
      this.loadConditionalList();
    } else if (tabName === 'overview') {
      this.updateStats();
    } else if (tabName === 'settings') {
      this.loadSettings();
    }
  }

  /**
   * Handle action buttons
   */
  handleAction(action, button) {
    switch (action) {
      case 'close':
        this.hide();
        break;

      case 'export':
        this.exportBlocklist();
        break;

      case 'import':
        this.uiContainer.querySelector('#import-file').click();
        break;

      case 'clear':
        this.clearBlocklist();
        break;

      case 'refresh-permanent':
        this.loadPermanentList();
        break;

      case 'remove':
        this.removeFromBlocklist(button.dataset.hash, button.dataset.type);
        break;

      case 'save-settings':
        this.saveSettings();
        break;
    }
  }

  /**
   * Update statistics
   */
  updateStats() {
    const stats = this.logger.getStatistics();

    this.uiContainer.querySelector('#stat-permanent').textContent = stats.blocklist.permanent;

    this.uiContainer.querySelector('#stat-conditional').textContent =
      stats.blocklist.mobile + stats.blocklist.low_memory + stats.blocklist.integrated_gpu;

    this.uiContainer.querySelector('#stat-failures').textContent = stats.aggregate.total_failures;

    // Count sessions
    const sessions = Object.keys(localStorage).filter((k) =>
      k.startsWith('preset-failures-')
    ).length;
    this.uiContainer.querySelector('#stat-sessions').textContent = sessions;
  }

  /**
   * Load permanent blocklist
   */
  loadPermanentList() {
    const blocklist = this.logger.blocklist;
    const listContainer = this.uiContainer.querySelector('#permanent-list');

    const items = Array.from(blocklist.permanent)
      .map((hash) => {
        const metadata = blocklist.metadata[hash] || {};
        return `
        <div class="blocklist-item" data-hash="${hash}">
          <div>
            <div class="blocklist-item-hash">${hash}</div>
            <div class="blocklist-item-stats">
              Added: ${new Date(metadata.added).toLocaleDateString()}
              ${metadata.auto_blocked ? '(Auto)' : '(Manual)'}
            </div>
          </div>
          <button class="remove-btn" data-action="remove" data-hash="${hash}" data-type="permanent">
            Remove
          </button>
        </div>
      `;
      })
      .join('');

    listContainer.innerHTML = items || '<p>No permanently blocked presets</p>';
  }

  /**
   * Load conditional blocklist
   */
  loadConditionalList() {
    const condition = this.uiContainer.querySelector('input[name="condition"]:checked').value;
    const blocklist = this.logger.blocklist;
    const listContainer = this.uiContainer.querySelector('#conditional-list');

    const items = (blocklist.conditional[condition] || [])
      .map((hash) => {
        return `
        <div class="blocklist-item" data-hash="${hash}">
          <div>
            <div class="blocklist-item-hash">${hash}</div>
            <div class="blocklist-item-stats">Blocked for: ${condition}</div>
          </div>
          <button class="remove-btn" data-action="remove" data-hash="${hash}" data-type="${condition}">
            Remove
          </button>
        </div>
      `;
      })
      .join('');

    listContainer.innerHTML = items || `<p>No presets blocked for ${condition}</p>`;
  }

  /**
   * Filter permanent list
   */
  filterPermanentList(search) {
    const items = this.uiContainer.querySelectorAll('#permanent-list .blocklist-item');
    const searchLower = search.toLowerCase();

    items.forEach((item) => {
      const hash = item.dataset.hash.toLowerCase();
      item.style.display = hash.includes(searchLower) ? 'flex' : 'none';
    });
  }

  /**
   * Remove from blocklist
   */
  removeFromBlocklist(hash, type) {
    if (confirm(`Remove ${hash} from blocklist?`)) {
      if (type === 'permanent') {
        this.logger.blocklist.permanent.delete(hash);
      } else {
        const index = this.logger.blocklist.conditional[type].indexOf(hash);
        if (index > -1) {
          this.logger.blocklist.conditional[type].splice(index, 1);
        }
      }

      this.logger.saveToFile();

      // Refresh the list
      if (type === 'permanent') {
        this.loadPermanentList();
      } else {
        this.loadConditionalList();
      }

      this.updateStats();
    }
  }

  /**
   * Export blocklist
   */
  exportBlocklist() {
    const data = this.logger.exportBlocklist();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `butterchurn-blocklist-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert(`Blocklist exported with ${data.stats.total_blocked} entries`);
  }

  /**
   * Import blocklist
   */
  async handleImport(file) {
    if (!file) {return;}

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const success = this.logger.importBlocklist(data);

      if (success) {
        alert(`Successfully imported blocklist entries`);
        this.updateStats();
        this.loadPermanentList();
      } else {
        alert(`Import failed`);
      }
    } catch (e) {
      alert(`Failed to import blocklist: ${e.message}`);
    }
  }

  /**
   * Clear blocklist
   */
  clearBlocklist() {
    if (confirm('Clear all preset failure logs and blocklists? This cannot be undone.')) {
      // Use logger's clearAllLogs to properly reset everything
      this.logger.clearAllLogs();

      alert('All logs and blocklists cleared');
      this.updateStats();
      this.loadPermanentList();
    }
  }

  /**
   * Load settings
   */
  loadSettings() {
    const autoBlocklist = config.get('userPreferences.autoBlocklistEnabled') !== false;
    const failureRate = config.get('presetFailures.autoBlocklist.failureRateThreshold') || 0.8;
    const failureCount = config.get('presetFailures.autoBlocklist.totalFailuresThreshold') || 50;
    const debugMode = config.get('userPreferences.debugMode') || false;

    this.uiContainer.querySelector('#auto-blocklist').checked = autoBlocklist;
    this.uiContainer.querySelector('#failure-threshold').value = failureRate * 100;
    this.uiContainer.querySelector('#failure-count').value = failureCount;
    this.uiContainer.querySelector('#debug-mode').checked = debugMode;
  }

  /**
   * Save settings
   */
  saveSettings() {
    const autoBlocklist = this.uiContainer.querySelector('#auto-blocklist').checked;
    const failureRate = this.uiContainer.querySelector('#failure-threshold').value / 100;
    const failureCount = parseInt(this.uiContainer.querySelector('#failure-count').value);
    const debugMode = this.uiContainer.querySelector('#debug-mode').checked;

    config.set('userPreferences.autoBlocklistEnabled', autoBlocklist);
    config.set('presetFailures.autoBlocklist.failureRateThreshold', failureRate);
    config.set('presetFailures.autoBlocklist.totalFailuresThreshold', failureCount);
    config.set('userPreferences.debugMode', debugMode);

    alert('Settings saved');
  }

  /**
   * Show the manager UI
   */
  show() {
    if (this.uiContainer) {
      this.uiContainer.classList.remove('hidden');
      this.isVisible = true;
      this.updateStats();
    }
  }

  /**
   * Hide the manager UI
   */
  hide() {
    if (this.uiContainer) {
      this.uiContainer.classList.add('hidden');
      this.isVisible = false;
    }
  }

  /**
   * Toggle visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Create a simple toggle button
   */
  createToggleButton(parentId = null) {
    const button = document.createElement('button');
    button.textContent = 'Blocklist Manager';
    button.className = 'butterchurn-blocklist-toggle';
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 10px 20px;
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 14px;
      z-index: 9999;
    `;

    button.addEventListener('click', () => this.toggle());

    if (parentId) {
      const parent = document.getElementById(parentId);
      if (parent) {
        parent.appendChild(button);
      } else {
        document.body.appendChild(button);
      }
    } else {
      document.body.appendChild(button);
    }

    return button;
  }

  // Delegate methods to PresetFailureLogger
  isBlocked(presetId, device = null) {
    return this.logger.isBlocked(presetId, device);
  }

  getStats() {
    return this.logger.getStatistics();
  }

  // Show UI is actually the show method
  showUI() {
    return this.show();
  }
}

// Export singleton
export const blocklistManager = new BlocklistManager();

export default BlocklistManager;