// Scene-based switching debug script
// Add this to the browser console after loading intelligent-selector-test.html

// Enable debug output
if (window.intelligentSelector) {
    console.log('=== Enabling Scene-Based Switching Debug Mode ===');

    // Enable debug output
    window.intelligentSelector.setDebugSceneChange(true);

    // Optional: Adjust thresholds for testing
    // Lower thresholds = more frequent switching
    // Higher thresholds = less frequent switching
    window.intelligentSelector.setSceneThresholds({
        sceneScore: 0.35,     // Default: 0.35 (35% overall scene change)
        energyChange: 0.25,   // Default: 0.25 (25% energy change)
        bassChange: 0.3       // Default: 0.3 (30% bass change)
    });

    console.log('Debug mode enabled. You will see:');
    console.log('- [Scene Change] scores every update');
    console.log('- [Switch Decision] reasoning when checking');
    console.log('- [Switch] scene state when switching');
    console.log('');
    console.log('Current intervals:');
    console.log(`- Min: ${window.intelligentSelector.minSwitchInterval}ms`);
    console.log(`- Max: ${window.intelligentSelector.maxSwitchInterval}ms`);
    console.log('');
    console.log('To adjust thresholds, use:');
    console.log('window.intelligentSelector.setSceneThresholds({ sceneScore: 0.3, energyChange: 0.2, bassChange: 0.25 })');
    console.log('');
    console.log('To disable debug output:');
    console.log('window.intelligentSelector.setDebugSceneChange(false)');
} else {
    console.error('IntelligentSelector not found. Make sure the test page is loaded.');
}