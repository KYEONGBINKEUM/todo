#[cfg(not(target_os = "android"))]
use tauri::Emitter;
#[cfg(not(target_os = "android"))]
use std::io::{Read, Write};
#[cfg(not(target_os = "android"))]
use std::net::TcpListener;

#[cfg(not(target_os = "android"))]
const LOGIN_HTML: &str = r##"<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Todo - Google Login</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #08081a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #111128; border: 1px solid #1e1e3a; border-radius: 16px; padding: 48px; text-align: center; max-width: 400px; width: 90%; }
  h1 { font-size: 28px; margin-bottom: 8px; background: linear-gradient(to right, #e2e8f0, #e94560); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  p { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
  .spinner { width: 40px; height: 40px; border: 3px solid #1e1e3a; border-top-color: #e94560; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 24px auto; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { color: #ef4444; margin-top: 16px; font-size: 13px; }
  .success { color: #34d399; }
  #status { margin-top: 16px; font-size: 13px; color: #94a3b8; }
</style>
</head>
<body>
<div class="card">
  <h1>AI Todo</h1>
  <p>Google 계정으로 로그인 중...</p>
  <div class="spinner" id="spinner"></div>
  <div id="status">팝업 창에서 Google 계정을 선택해주세요</div>
  <div class="error" id="error"></div>
</div>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script>
(async function() {
  var params = new URLSearchParams(location.search);
  var config = {
    apiKey: params.get('apiKey'),
    authDomain: params.get('authDomain'),
    projectId: params.get('projectId'),
  };
  var statusEl = document.getElementById('status');
  var errorEl = document.getElementById('error');
  var spinnerEl = document.getElementById('spinner');

  try {
    firebase.initializeApp(config);
    var provider = new firebase.auth.GoogleAuthProvider();
    var result = await firebase.auth().signInWithPopup(provider);
    var user = result.user;

    statusEl.textContent = '인증 정보를 전송 중...';

    // Force token refresh to get fresh tokens
    var accessToken = await user.getIdToken(true);

    // Build user data object matching Firebase Auth v9 localStorage format
    var userData = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      isAnonymous: user.isAnonymous,
      photoURL: user.photoURL,
      providerData: user.providerData.map(function(p) {
        return {
          providerId: p.providerId,
          uid: p.uid,
          displayName: p.displayName,
          email: p.email,
          phoneNumber: p.phoneNumber,
          photoURL: p.photoURL
        };
      }),
      stsTokenManager: {
        refreshToken: user.refreshToken,
        accessToken: accessToken,
        expirationTime: Date.now() + 3600 * 1000
      },
      createdAt: String(new Date(user.metadata.creationTime).getTime()),
      lastLoginAt: String(new Date(user.metadata.lastSignInTime).getTime()),
      apiKey: config.apiKey,
      appName: '[DEFAULT]'
    };

    // POST user data to callback endpoint
    await fetch('/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    spinnerEl.style.display = 'none';
    statusEl.innerHTML = '<span class="success">&#10003; 로그인 완료!</span><br><br>이 창을 닫고 앱으로 돌아가세요.';
    setTimeout(function() { window.close(); }, 2000);
  } catch (err) {
    spinnerEl.style.display = 'none';
    statusEl.textContent = '';
    errorEl.textContent = '로그인 실패: ' + (err.message || err);
    console.error(err);
  }
})();
</script>
</body>
</html>"##;

#[cfg(not(target_os = "android"))]
const SUCCESS_HTML: &str = r#"{"ok":true}"#;

#[cfg(not(target_os = "android"))]
fn send_response(stream: &mut std::net::TcpStream, status: &str, content_type: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n\r\n{}",
        status, content_type, body.len(), body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[cfg(not(target_os = "android"))]
fn read_request(stream: &mut std::net::TcpStream) -> String {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];

    loop {
        match stream.read(&mut tmp) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&tmp[..n]);
                // Check if we've received the full request
                let s = String::from_utf8_lossy(&buf);
                if let Some(header_end) = s.find("\r\n\r\n") {
                    // Check for Content-Length to see if there's a body
                    let headers = &s[..header_end];
                    if let Some(cl_line) = headers.lines().find(|l| l.to_lowercase().starts_with("content-length:")) {
                        if let Ok(cl) = cl_line.split(':').nth(1).unwrap_or("0").trim().parse::<usize>() {
                            let body_start = header_end + 4;
                            if buf.len() >= body_start + cl {
                                break;
                            }
                            // Need more data, continue reading
                            continue;
                        }
                    }
                    break; // No Content-Length, request is complete
                }
                if buf.len() > 65536 {
                    break; // Safety limit
                }
            }
            Err(_) => break,
        }
    }

    String::from_utf8_lossy(&buf).to_string()
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn start_oauth_server(app_handle: tauri::AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    std::thread::spawn(move || {
        for _ in 0..10 {
            if let Ok((mut stream, _)) = listener.accept() {
                let request = read_request(&mut stream);

                let first_line = request.lines().next().unwrap_or("");
                let method = first_line.split_whitespace().next().unwrap_or("");
                let path = first_line.split_whitespace().nth(1).unwrap_or("/");

                if method == "OPTIONS" {
                    // CORS preflight
                    send_response(&mut stream, "204 No Content", "text/plain", "");
                    continue;
                }

                if method == "POST" && path == "/callback" {
                    // Extract JSON body
                    let body = if let Some(pos) = request.find("\r\n\r\n") {
                        request[pos + 4..].to_string()
                    } else {
                        String::new()
                    };

                    send_response(&mut stream, "200 OK", "application/json", SUCCESS_HTML);

                    // Emit user data to frontend
                    let _ = app_handle.emit("oauth-callback", body);
                    break; // Done
                } else if path == "/favicon.ico" {
                    send_response(&mut stream, "204 No Content", "text/plain", "");
                } else {
                    // Serve login page
                    send_response(&mut stream, "200 OK", "text/html", LOGIN_HTML);
                }
            }
        }
    });

    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init());

    #[cfg(not(target_os = "android"))]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![start_oauth_server]);

    #[cfg(target_os = "android")]
    let builder = builder
        .invoke_handler(tauri::generate_handler![]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
