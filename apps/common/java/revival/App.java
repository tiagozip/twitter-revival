package revival;

import android.app.Activity;
import android.app.Application;
import android.os.Build;
import android.os.Bundle;
import android.os.StrictMode;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;

public class App extends Application {
    static App instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build());
        LocalProxy.start(this);
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityCreated(Activity activity, Bundle state) {
                Window window = activity.getWindow();
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.setStatusBarColor(0xff000000);
                window.setNavigationBarColor(0xff000000);
                View decor = window.getDecorView();
                decor.setSystemUiVisibility(decor.getSystemUiVisibility() & ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR));
                if (Build.VERSION.SDK_INT >= 30 && decor.getWindowInsetsController() != null) {
                    decor.getWindowInsetsController().setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
                }
                ServerMenu.attach(activity);
            }

            @Override
            public void onActivityStarted(Activity activity) {}

            @Override
            public void onActivityResumed(Activity activity) {
                if (activity instanceof MediaActivity) return;
                MenuButton.attach(activity);
                PollDialog.attachButton(activity);
                if (Server.base(activity) != null) return;
                activity.getWindow().getDecorView().post(new Runnable() {
                    @Override
                    public void run() {
                        if (Server.base(activity) == null) Server.prompt(activity, false);
                    }
                });
            }

            @Override
            public void onActivityPaused(Activity activity) {}

            @Override
            public void onActivityStopped(Activity activity) {}

            @Override
            public void onActivitySaveInstanceState(Activity activity, Bundle state) {}

            @Override
            public void onActivityDestroyed(Activity activity) {}
        });
    }
}
