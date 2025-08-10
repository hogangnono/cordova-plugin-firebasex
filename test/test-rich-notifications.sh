#!/bin/bash

# iOS 리치 푸시 알림 테스트 스크립트 (개발용)
# 이 스크립트는 Notification Service Extension과 Content Extension이 올바르게 작동하는지 테스트합니다.
# 실제 운영에서는 서버에서 FCM을 통해 푸시를 전송하며, 이 스크립트는 개발/테스트 목적으로만 사용됩니다.

set -e

echo "🚀 iOS 리치 푸시 알림 테스트 시작"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 필수 도구 확인
check_requirements() {
    log_info "필수 도구 확인 중..."

    if ! command -v cordova &> /dev/null; then
        log_error "Cordova가 설치되지 않았습니다. 'npm install -g cordova'로 설치하세요."
        exit 1
    fi

    if ! command -v xcodebuild &> /dev/null; then
        log_error "Xcode가 설치되지 않았습니다. App Store에서 Xcode를 설치하세요."
        exit 1
    fi

    log_success "필수 도구 확인 완료"
}

# 테스트 프로젝트 생성
create_test_project() {
    log_info "테스트 프로젝트 생성 중..."

    # 기존 테스트 프로젝트가 있으면 삭제
    if [ -d "test-rich-notifications" ]; then
        rm -rf test-rich-notifications
    fi

    # 새 프로젝트 생성
    cordova create test-rich-notifications com.example.richtest RichNotificationsTest
    cd test-rich-notifications

    # iOS 플랫폼 추가
    cordova platform add ios

    # Firebase 플러그인 추가
    cordova plugin add ../cordova-plugin-firebasex

    log_success "테스트 프로젝트 생성 완료"
}

# 설정 파일 생성
create_config() {
    log_info "설정 파일 생성 중..."

    # config.xml에 리치 알림 설정 추가
    cat >> config.xml << EOF

    <!-- Rich Push Notifications Settings -->
    <preference name="IOS_NOTIFICATION_SERVICE_ENABLED" value="true" />
    <preference name="IOS_NOTIFICATION_CONTENT_ENABLED" value="true" />
    <preference name="FIREBASE_ANALYTICS_COLLECTION_ENABLED" value="false" />
    <preference name="FIREBASE_PERFORMANCE_COLLECTION_ENABLED" value="false" />
    <preference name="FIREBASE_CRASHLYTICS_COLLECTION_ENABLED" value="false" />
EOF

    log_success "설정 파일 생성 완료"
}

# 테스트 HTML 파일 생성
create_test_html() {
    log_info "테스트 HTML 파일 생성 중..."

    cat > www/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="initial-scale=1, width=device-width, viewport-fit=cover">
    <title>리치 푸시 알림 테스트</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .test-section {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }
        .test-section h3 {
            margin-top: 0;
            color: #555;
        }
        button {
            background: #007AFF;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin: 5px;
            transition: background 0.3s;
        }
        button:hover {
            background: #0056CC;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .status {
            margin-top: 10px;
            padding: 10px;
            border-radius: 5px;
            font-weight: bold;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .status.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        .log {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 5px;
            padding: 10px;
            margin-top: 10px;
            font-family: monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 리치 푸시 알림 테스트</h1>

        <div class="test-section">
            <h3>1. 알림 권한 요청</h3>
            <button onclick="requestPermission()">알림 권한 요청</button>
            <button onclick="checkPermission()">권한 상태 확인</button>
            <div id="permission-status"></div>
        </div>

        <div class="test-section">
            <h3>2. 리치 알림 테스트</h3>
            <button onclick="sendRichNotification('jpg')">JPG 이미지 알림</button>
            <button onclick="sendRichNotification('png')">PNG 이미지 알림</button>
            <button onclick="sendRichNotification('gif')">GIF 이미지 알림</button>
            <button onclick="testBackgroundNotification()">백그라운드 테스트</button>
            <div id="notification-status"></div>
        </div>

        <div class="test-section">
            <h3>3. 알림 카테고리 설정</h3>
            <button onclick="setupCategories()">카테고리 설정</button>
            <div id="category-status"></div>
        </div>

        <div class="test-section">
            <h3>4. 로그</h3>
            <div id="log" class="log"></div>
        </div>
    </div>

    <script type="text/javascript" src="cordova.js"></script>
    <script type="text/javascript" src="js/index.js"></script>
    <script>
        document.addEventListener('deviceready', onDeviceReady, false);

        function onDeviceReady() {
            log('디바이스 준비 완료');
            checkPermission();
        }

        function log(message) {
            const logElement = document.getElementById('log');
            const timestamp = new Date().toLocaleTimeString();
            logElement.innerHTML += `[${timestamp}] ${message}\n`;
            logElement.scrollTop = logElement.scrollHeight;
            console.log(message);
        }

        function showStatus(elementId, message, type) {
            const element = document.getElementById(elementId);
            element.innerHTML = `<div class="status ${type}">${message}</div>`;
        }

        function requestPermission() {
            log('알림 권한 요청 중...');
            FirebasePlugin.grantPermission(function(granted) {
                if (granted) {
                    log('알림 권한 허용됨');
                    showStatus('permission-status', '✅ 알림 권한이 허용되었습니다.', 'success');
                } else {
                    log('알림 권한 거부됨');
                    showStatus('permission-status', '❌ 알림 권한이 거부되었습니다.', 'error');
                }
            }, function(error) {
                log('권한 요청 실패: ' + error);
                showStatus('permission-status', '❌ 권한 요청 실패: ' + error, 'error');
            });
        }

        function checkPermission() {
            log('권한 상태 확인 중...');
            FirebasePlugin.hasPermission(function(hasPermission) {
                if (hasPermission) {
                    log('알림 권한 있음');
                    showStatus('permission-status', '✅ 알림 권한이 있습니다.', 'success');
                } else {
                    log('알림 권한 없음');
                    showStatus('permission-status', '❌ 알림 권한이 없습니다.', 'error');
                }
            }, function(error) {
                log('권한 확인 실패: ' + error);
                showStatus('permission-status', '❌ 권한 확인 실패: ' + error, 'error');
            });
        }

        function sendRichNotification(imageType) {
            log(`${imageType.toUpperCase()} 이미지 알림 전송 중...`);

            const imageUrls = {
                jpg: 'https://picsum.photos/300/200.jpg',
                png: 'https://picsum.photos/300/200.png',
                gif: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif'
            };

            const notificationData = {
                title: `${imageType.toUpperCase()} 이미지 테스트`,
                body: '이미지가 포함된 리치 푸시 알림입니다.',
                imageUrl: imageUrls[imageType],
                imageType: imageType,
                description: '이것은 확장 화면에서 보이는 상세 설명입니다. 이미지를 길게 눌러서 확장 화면을 확인해보세요.',
                actionTitle: '자세히 보기',
                deepLink: 'richtest://detail/123',
                category: 'test',
                backgroundColor: '#FF6B6B'
            };

            FirebasePlugin.sendNotificationWithImage(notificationData, function(success) {
                log('알림 전송 성공: ' + success);
                showStatus('notification-status', `✅ ${imageType.toUpperCase()} 이미지 알림이 전송되었습니다.`, 'success');

                // 백그라운드 테스트 안내
                setTimeout(() => {
                    if (confirm('앱을 백그라운드로 보내거나 종료한 후 알림을 확인하시겠습니까?')) {
                        log('백그라운드 테스트를 위해 앱을 백그라운드로 보내세요.');
                        showStatus('notification-status', '📱 앱을 백그라운드로 보내고 알림을 확인하세요!', 'info');
                    }
                }, 1000);
            }, function(error) {
                log('알림 전송 실패: ' + error);
                showStatus('notification-status', `❌ 알림 전송 실패: ${error}`, 'error');
            });
        }

        function testBackgroundNotification() {
            log('백그라운드 테스트 알림 전송 중...');

            const notificationData = {
                title: '백그라운드 테스트',
                body: '앱을 백그라운드로 보내고 이 알림을 확인하세요',
                imageUrl: 'https://picsum.photos/300/200.jpg',
                imageType: 'jpg',
                description: '이 알림은 앱이 백그라운드에 있을 때 시스템 푸시로 표시됩니다.',
                actionTitle: '앱 열기',
                deepLink: 'richtest://open',
                category: 'background-test'
            };

            FirebasePlugin.sendNotificationWithImage(notificationData, function(success) {
                log('백그라운드 테스트 알림 전송 성공');
                showStatus('notification-status', '✅ 백그라운드 테스트 알림이 전송되었습니다. 앱을 백그라운드로 보내세요!', 'success');
            }, function(error) {
                log('백그라운드 테스트 알림 전송 실패: ' + error);
                showStatus('notification-status', '❌ 백그라운드 테스트 알림 전송 실패: ' + error, 'error');
            });
        }

        function setupCategories() {
            log('알림 카테고리 설정 중...');

            const categories = [
                {
                    identifier: 'test',
                    actions: [
                        {
                            identifier: 'view',
                            title: '보기',
                            options: 'foreground'
                        },
                        {
                            identifier: 'share',
                            title: '공유',
                            options: 'foreground'
                        },
                        {
                            identifier: 'delete',
                            title: '삭제',
                            options: 'destructive'
                        }
                    ]
                }
            ];

            FirebasePlugin.setupNotificationCategories(categories, function(success) {
                log('카테고리 설정 성공: ' + success);
                showStatus('category-status', '✅ 알림 카테고리가 설정되었습니다.', 'success');
            }, function(error) {
                log('카테고리 설정 실패: ' + error);
                showStatus('category-status', '❌ 카테고리 설정 실패: ' + error, 'error');
            });
        }

        // 알림 수신 이벤트 리스너
        FirebasePlugin.onMessageReceived(function(notification) {
            log('알림 수신: ' + JSON.stringify(notification));
        }, function(error) {
            log('알림 수신 에러: ' + error);
        });

        // 토큰 새로고침 이벤트 리스너
        FirebasePlugin.onTokenRefresh(function(token) {
            log('FCM 토큰 새로고침: ' + token);
        }, function(error) {
            log('토큰 새로고침 에러: ' + error);
        });
    </script>
</body>
</html>
EOF

    log_success "테스트 HTML 파일 생성 완료"
}

# 프로젝트 빌드
build_project() {
    log_info "프로젝트 빌드 중..."

    # 프로젝트 준비
    cordova prepare ios

    log_warning "Xcode에서 프로젝트를 열어 다음 작업을 수행하세요:"
    log_warning "1. File > New > Target > Notification Service Extension"
    log_warning "2. File > New > Target > Notification Content Extension"
    log_warning "3. Bundle ID 설정 (예: com.example.richtest.NotificationService)"
    log_warning "4. Provisioning Profile 설정"
    log_warning "5. 빌드 및 실행"

    log_success "프로젝트 준비 완료"
}

# 메인 실행
main() {
    log_info "iOS 리치 푸시 알림 테스트 시작"

    check_requirements
    create_test_project
    create_config
    create_test_html
    build_project

    log_success "테스트 프로젝트가 성공적으로 생성되었습니다!"
    log_info "다음 단계:"
    log_info "1. cd test-rich-notifications"
    log_info "2. Xcode에서 platforms/ios/RichNotificationsTest.xcworkspace 열기"
    log_info "3. Notification Service Extension과 Content Extension 추가"
    log_info "4. 빌드 및 실행"
    log_info "5. 앱에서 테스트 버튼 클릭"
}

# 스크립트 실행
main "$@"
