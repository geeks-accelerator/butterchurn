import "ecma-proposal-math-extensions";
import "./presetBase";
import Visualizer from "./visualizer";
import IntelligentPresetSelector from "./intelligentPresetSelector";

class Butterchurn {
  static createVisualizer(context, canvas, opts) {
    return new Visualizer(context, canvas, opts);
  }
}

// Attach IntelligentPresetSelector to the main export for UMD compatibility
Butterchurn.IntelligentPresetSelector = IntelligentPresetSelector;

export default Butterchurn;
export { IntelligentPresetSelector };
