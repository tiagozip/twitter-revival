package revival;

import android.content.Context;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class LocalProxy {
    private static volatile boolean started;
    private static Context app;
    private static final ExecutorService WORKERS = Executors.newFixedThreadPool(8);

    private LocalProxy() {}

    public static synchronized void start(Context context) {
        if (started) return;
        started = true;
        app = context.getApplicationContext();
        Thread accept = new Thread(new Runnable() {
            @Override
            public void run() {
                try (ServerSocket server = new ServerSocket(Spec.PORT, 64, InetAddress.getByName("127.0.0.1"))) {
                    server.setReuseAddress(true);
                    while (true) {
                        final Socket socket = server.accept();
                        WORKERS.execute(new Runnable() {
                            @Override
                            public void run() {
                                serve(socket);
                            }
                        });
                    }
                } catch (IOException e) {
                    started = false;
                }
            }
        }, "revival-proxy");
        accept.setDaemon(true);
        accept.start();
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        for (int c = in.read(); c != -1; c = in.read()) {
            if (c == '\n') break;
            if (c != '\r') line.write(c);
        }
        return line.toString("ISO-8859-1");
    }

    private static byte[] readBody(InputStream in, Map<String, String> headers) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        if ("chunked".equalsIgnoreCase(headers.get("transfer-encoding"))) {
            while (true) {
                String size = readLine(in).trim();
                int semi = size.indexOf(';');
                int n = Integer.parseInt(semi >= 0 ? size.substring(0, semi) : size, 16);
                if (n == 0) {
                    while (!readLine(in).isEmpty()) {
                    }
                    break;
                }
                byte[] chunk = new byte[n];
                int got = 0;
                while (got < n) {
                    int r = in.read(chunk, got, n - got);
                    if (r == -1) throw new IOException("short chunk");
                    got += r;
                }
                body.write(chunk);
                readLine(in);
            }
            return body.toByteArray();
        }
        String length = headers.get("content-length");
        if (length == null) return new byte[0];
        int remaining = Integer.parseInt(length.trim());
        byte[] buffer = new byte[16384];
        while (remaining > 0) {
            int r = in.read(buffer, 0, Math.min(buffer.length, remaining));
            if (r == -1) break;
            body.write(buffer, 0, r);
            remaining -= r;
        }
        return body.toByteArray();
    }

    private static void respond(OutputStream out, int status, String reason, String type, byte[] body) throws IOException {
        String head = "HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
        out.flush();
    }

    private static void serve(Socket socket) {
        try (Socket s = socket) {
            try {
                s.setSoTimeout(120000);
                InputStream in = new BufferedInputStream(s.getInputStream());
                OutputStream out = s.getOutputStream();
                String requestLine = readLine(in);
                String[] parts = requestLine.split(" ");
                if (parts.length < 2) return;
                String method = parts[0];
                String target = parts[1];
                Map<String, String> headers = new LinkedHashMap<>();
                Map<String, String> original = new LinkedHashMap<>();
                for (String line = readLine(in); !line.isEmpty(); line = readLine(in)) {
                    int colon = line.indexOf(':');
                    if (colon <= 0) continue;
                    String name = line.substring(0, colon).trim();
                    String value = line.substring(colon + 1).trim();
                    headers.put(name.toLowerCase(Locale.US), value);
                    original.put(name, value);
                }
                if ("100-continue".equalsIgnoreCase(headers.get("expect"))) {
                    out.write("HTTP/1.1 100 Continue\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
                    out.flush();
                }
                byte[] body = readBody(in, headers);
                String base = Server.base(app);
                if (base == null) {
                    respond(out, 503, "Service Unavailable", "application/json", "{\"errors\":[{\"code\":503,\"message\":\"Set up your Twitter Revival server first\"}],\"error\":\"Set up your Twitter Revival server first\"}".getBytes(StandardCharsets.UTF_8));
                    return;
                }
                if (target.startsWith("http://") || target.startsWith("https://")) {
                    target = new URL(target).getFile();
                }
                HttpURLConnection conn = (HttpURLConnection) new URL(base + target).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(120000);
                conn.setRequestMethod(method);
                for (Map.Entry<String, String> h : original.entrySet()) {
                    String key = h.getKey().toLowerCase(Locale.US);
                    if (key.equals("host") || key.equals("connection") || key.equals("accept-encoding") || key.equals("content-length") || key.equals("transfer-encoding") || key.equals("expect")) continue;
                    conn.setRequestProperty(h.getKey(), h.getValue());
                }
                conn.setRequestProperty("X-Revival-Client", Spec.ERA);
                conn.setRequestProperty("X-Revival-Base", "http://127.0.0.1:" + Spec.PORT);
                if (body.length > 0 || method.equals("POST") || method.equals("PUT")) {
                    conn.setDoOutput(true);
                    conn.setFixedLengthStreamingMode(body.length);
                    try (OutputStream upstream = conn.getOutputStream()) {
                        upstream.write(body);
                    }
                }
                int status = conn.getResponseCode();
                InputStream upstream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                ByteArrayOutputStream response = new ByteArrayOutputStream();
                if (upstream != null) {
                    byte[] buffer = new byte[16384];
                    for (int n = upstream.read(buffer); n != -1; n = upstream.read(buffer)) response.write(buffer, 0, n);
                    upstream.close();
                }
                String type = conn.getContentType();
                String reason = conn.getResponseMessage();
                respond(out, status, reason == null ? "OK" : reason, type == null ? "application/octet-stream" : type, response.toByteArray());
                conn.disconnect();
            } catch (Throwable t) {
                try {
                    respond(s.getOutputStream(), 502, "Bad Gateway", "application/json", ("{\"errors\":[{\"code\":502,\"message\":\"Revival server unreachable\"}],\"error\":\"" + String.valueOf(t.getMessage()).replace("\"", "'") + "\"}").getBytes(StandardCharsets.UTF_8));
                } catch (Throwable ignored) {
                }
            }
        } catch (Throwable ignored) {
        }
    }
}
