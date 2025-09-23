import "ecma-proposal-math-extensions";
import "./presetBase";
import Visualizer from "./visualizer";
import IntelligentPresetSelector from "./intelligentPresetSelector";
import AdvancedAudioAnalyzer from "./audio/advancedAnalyzer";
import DeviceCapabilities from "./utils/deviceCapabilities";

class Butterchurn {
  static createVisualizer(context, canvas, opts) {
    return new Visualizer(context, canvas, opts);
  }
}

// Attach classes to the main export for UMD compatibility
Butterchurn.IntelligentPresetSelector = IntelligentPresetSelector;
Butterchurn.AdvancedAudioAnalyzer = AdvancedAudioAnalyzer;
Butterchurn.DeviceCapabilities = DeviceCapabilities;

export default Butterchurn;
export { IntelligentPresetSelector, AdvancedAudioAnalyzer, DeviceCapabilities };
