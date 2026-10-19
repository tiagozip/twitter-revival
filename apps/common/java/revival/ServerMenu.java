package revival;

import android.app.Activity;
import android.view.Menu;
import android.view.MenuItem;
import android.view.Window;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

public final class ServerMenu {
    private static final int ITEM = 0x7265766c;

    private ServerMenu() {}

    public static void attach(final Activity activity) {
        final Window window = activity.getWindow();
        final Window.Callback original = window.getCallback();
        if (original == null || Proxy.isProxyClass(original.getClass())) return;
        window.setCallback((Window.Callback) Proxy.newProxyInstance(Window.Callback.class.getClassLoader(), new Class<?>[] {Window.Callback.class}, new InvocationHandler() {
            @Override
            public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                String name = method.getName();
                if (name.equals("onMenuItemSelected") && args[1] instanceof MenuItem && ((MenuItem) args[1]).getItemId() == ITEM) {
                    Server.prompt(activity, true);
                    return true;
                }
                if (name.equals("onMenuItemSelected") && args[1] instanceof MenuItem && ((MenuItem) args[1]).getItemId() == ITEM + 1) {
                    PollDialog.show(activity);
                    return true;
                }
                Object result;
                try {
                    result = method.invoke(original, args);
                } catch (InvocationTargetException e) {
                    throw e.getCause();
                }
                if (name.equals("onCreatePanelMenu") && (Integer) args[0] == Window.FEATURE_OPTIONS_PANEL) return true;
                if (name.equals("onPreparePanel") && (Integer) args[0] == Window.FEATURE_OPTIONS_PANEL && args[2] instanceof Menu) {
                    Menu menu = (Menu) args[2];
                    if (PollDialog.wanted(activity) && menu.findItem(ITEM + 1) == null) menu.add(Menu.NONE, ITEM + 1, 9999, "Add poll\u2026");
                    if (menu.findItem(ITEM) == null) menu.add(Menu.NONE, ITEM, 10000, "Revival server\u2026");
                    return true;
                }
                return result;
            }
        }));
    }
}
