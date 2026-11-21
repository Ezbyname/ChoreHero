package expo.modules.keyboardframe

import android.view.View
import android.view.ViewTreeObserver
import androidx.core.os.bundleOf
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reports the soft keyboard's top edge every time its height changes.
//
// React Native 0.85 (ReactRootView.checkForKeyboardEvents) only emits
// keyboardDidShow / keyboardDidHide when the keyboard's VISIBILITY flips.
// Moving focus between a text field and a number-pad field swaps the IME
// layout without hiding it, so RN sends nothing and Create Reward kept the
// previous keyboard's padding (vc22: button 28 dp under the taller text
// keyboard, or a 40-52 dp empty band above the shorter number pad).
//
// An IME inset change makes the view root re-layout (ViewRootImpl
// notifyInsetsChanged -> requestLayout), so a global-layout listener sees
// every effective keyboard geometry, including type switches.
//
// screenY is in the same space as RN's keyboard event screenY (top of the
// display, dp): with edge-to-edge the decor view spans the whole screen, so
// decorHeight - imeInset is the keyboard's top edge.
class KeyboardFrameModule : Module() {
  private var observedView: View? = null
  private var observing = false
  private var lastImePx = -1

  private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener { emitIfChanged() }

  override fun definition() = ModuleDefinition {
    Name("KeyboardFrame")

    Events(EVENT)

    OnStartObserving {
      observing = true
      onUiThread { attach() }
    }

    OnStopObserving {
      observing = false
      onUiThread { detach() }
    }

    // A recreated activity (font scale / display size change) has a new
    // decor view: follow it.
    OnActivityEntersForeground {
      if (observing) onUiThread { attach() }
    }

    OnDestroy {
      observing = false
      onUiThread { detach() }
    }
  }

  private fun onUiThread(block: () -> Unit) {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread { block() }
  }

  private fun attach() {
    val decor = appContext.currentActivity?.window?.decorView ?: return
    if (observedView === decor) {
      emitIfChanged()
      return
    }
    detach()
    observedView = decor
    lastImePx = -1
    decor.viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
    emitIfChanged()
  }

  private fun detach() {
    val view = observedView ?: return
    if (view.viewTreeObserver.isAlive) {
      view.viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
    }
    observedView = null
  }

  private fun emitIfChanged() {
    val view = observedView ?: return
    val insets = ViewCompat.getRootWindowInsets(view) ?: return
    val visible = insets.isVisible(WindowInsetsCompat.Type.ime())
    val imePx = if (visible) insets.getInsets(WindowInsetsCompat.Type.ime()).bottom else 0
    if (imePx == lastImePx || view.height <= 0) return
    lastImePx = imePx
    val density = view.resources.displayMetrics.density
    sendEvent(
      EVENT,
      bundleOf(
        "visible" to (imePx > 0),
        "screenY" to ((view.height - imePx) / density).toDouble(),
        "height" to (imePx / density).toDouble()
      )
    )
  }

  companion object {
    private const val EVENT = "onKeyboardFrame"
  }
}
