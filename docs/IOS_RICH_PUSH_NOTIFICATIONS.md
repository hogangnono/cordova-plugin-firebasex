# iOS 리치 푸시 알림 가이드

이 문서는 iOS 앱에서 이미지가 포함된 리치 푸시 알림을 구현하는 방법을 설명합니다.

## 개요

이 플러그인은 다음 기능을 제공합니다:

1. **Notification Service Extension**: 푸시 알림에 이미지를 다운로드하고 첨부
2. **Notification Content Extension**: 사용자가 알림을 길게 눌렀을 때 확장된 커스텀 UI 표시
3. **JavaScript API**: 클라이언트에서 리치 알림을 쉽게 보낼 수 있는 API

## 설정

### 1. Apple Developer 설정

> ⚠️ **중요**: Notification Service Extension과 Content Extension을 사용하려면 반드시 **Push Notifications** Capability가 활성화되어야 합니다. 이는 Apple의 필수 요구사항입니다.

> 💡 **참고**: Xcode에서 Extension을 생성하면 자동으로 Apple Developer에 새로운 App ID가 생성됩니다. 별도로 수동으로 생성할 필요가 없습니다.

#### 자동 생성 (권장)
1. Xcode에서 Extension Target을 생성하면 자동으로 Apple Developer에 App ID가 생성됩니다
2. **Signing & Capabilities**에서 **Push Notifications**가 활성화되어 있는지 확인하세요

#### 수동 생성 (필요한 경우)
만약 자동 생성이 되지 않거나 문제가 있는 경우:

**Notification Service Identifier 생성**
1. [Apple Developer Program](https://developer.apple.com/account)에 로그인
2. **Certificates, Identifiers & Profiles** > **Identifiers** 클릭
3. **+** 버튼을 클릭하여 새 식별자 추가
4. **App IDs** 선택 후 계속
5. **App** 타입 선택 후 계속
6. **Description**에 `AppName Notification Service` 입력
7. **Bundle ID**에 `app.package.name.NotificationService` 입력 (Explicit로 설정)
8. **Capabilities**에서 **Push Notifications**를 반드시 활성화
9. 계속을 클릭하여 저장

**Notification Content Identifier 생성**
1. 위와 동일한 과정을 반복하되:
   - **Description**: `AppName Notification Content`
   - **Bundle ID**: `app.package.name.NotificationContent`
   - **Capabilities**: **Push Notifications**를 반드시 활성화

#### Provisioning Profile 생성 (자동 생성이 안 되는 경우)
1. **Profiles** 섹션으로 이동
2. **+** 버튼을 클릭하여 새 프로파일 생성
3. **App Store** 선택 후 계속
4. 생성한 두 식별자를 모두 선택
5. 현재 사용 중인 App Store 인증서 선택
6. **Provisioning Profile Name**에 적절한 이름 입력
7. **Generate** 클릭

> 💡 **참고**: Xcode에서 자동으로 Provisioning Profile도 생성되므로, 대부분의 경우 수동으로 생성할 필요가 없습니다.

### 2. Xcode 설정

#### 자동 설정 (권장)
플러그인이 자동으로 Extension을 생성하므로 Xcode에서 수동으로 생성할 필요가 없습니다.

#### 수동 설정 (필요한 경우)
만약 자동 생성이 되지 않거나 문제가 있는 경우:

1. Xcode에서 프로젝트 열기
2. **File** > **New** > **Target** 선택
3. **Notification Service Extension** 선택
4. **Product Name**: `NotificationService`
5. **Language**: `Swift` 선택
6. **Bundle Identifier**: 자동으로 `com.yourcompany.yourapp.NotificationService`로 설정됨
7. **Notification Content Extension**도 동일하게 생성
   - **Product Name**: `NotificationContent`
   - **Bundle Identifier**: 자동으로 `com.yourcompany.yourapp.NotificationContent`로 설정됨
8. 각 Extension의 **Signing & Capabilities**에서 **Push Notifications**가 활성화되어 있는지 확인
9. **Team**과 **Provisioning Profile**이 올바르게 설정되어 있는지 확인

### 3. 플러그인 설정

`config.xml`에서 다음 설정을 활성화:

```xml
<preference name="IOS_NOTIFICATION_SERVICE_ENABLED" value="true" />
<preference name="IOS_NOTIFICATION_CONTENT_ENABLED" value="true" />
```

> 🎉 **완전 자동화**: 이 설정을 활성화하면 플러그인이 자동으로 다음을 수행합니다:
> - Notification Service Extension 생성
> - Notification Content Extension 생성
> - 소스 파일 복사
> - Info.plist 생성
> - Xcode 프로젝트 설정

## 사용법

### 1. 기본 사용법

```javascript
// 리치 푸시 알림 보내기
FirebasePlugin.sendNotificationWithImage({
    title: "새로운 알림",
    body: "이미지가 포함된 알림입니다",
    imageUrl: "https://example.com/image.jpg",
    imageType: "jpg", // 'png', 'jpg', 'gif' 중 선택
    description: "확장 화면에서 보이는 상세 설명",
    actionTitle: "자세히 보기",
    deepLink: "myapp://detail/123",
    category: "news",
    backgroundColor: "#FF6B6B"
}, function(success) {
    console.log("알림 전송 성공");
}, function(error) {
    console.error("알림 전송 실패:", error);
});
```

### 2. 알림 카테고리 설정

```javascript
// 커스텀 알림 카테고리 설정
FirebasePlugin.setupNotificationCategories([
    {
        identifier: "news",
        actions: [
            {
                identifier: "read",
                title: "읽기",
                options: "foreground"
            },
            {
                identifier: "share",
                title: "공유",
                options: "foreground"
            },
            {
                identifier: "delete",
                title: "삭제",
                options: "destructive"
            }
        ]
    }
], function(success) {
    console.log("알림 카테고리 설정 완료");
}, function(error) {
    console.error("알림 카테고리 설정 실패:", error);
});
```

### 3. 서버에서 보내는 푸시 알림 페이로드

```json
{
  "name": "rich_notification",
  "notification": {
    "body": "이미지가 포함된 푸시 알림",
    "title": "새로운 소식"
  },
  "data": {
    "notification_foreground": "true",
    "notification_ios_image_jpg": "https://example.com/image.jpg",
    "notification_ios_image_png": "https://example.com/image.png",
    "notification_ios_image_gif": "https://example.com/animation.gif",
    "notification_description": "확장 화면에서 보이는 상세 설명",
    "notification_action_title": "자세히 보기",
    "notification_deep_link": "myapp://detail/123",
    "notification_category": "news",
    "notification_background_color": "#FF6B6B"
  }
}
```

## 지원되는 이미지 형식

- **PNG**: 투명도 지원, 고품질
- **JPG**: 압축률 높음, 파일 크기 작음
- **GIF**: 애니메이션 지원

## 확장 화면 기능

### Notification Service Extension
- 이미지 다운로드 및 첨부
- 알림 콘텐츠 수정
- 백그라운드에서 실행

### Notification Content Extension
- 커스텀 UI 렌더링
- 이미지 확대 표시
- 상세 설명 표시
- 액션 버튼 제공

## 고급 설정

### 1. 이미지 크기 최적화

```javascript
// 이미지 크기 제한 설정
FirebasePlugin.sendNotificationWithImage({
    title: "최적화된 이미지",
    body: "적절한 크기의 이미지",
    imageUrl: "https://example.com/optimized-image.jpg",
    imageType: "jpg",
    // 이미지는 10MB 이하, 300x300 픽셀 권장
    description: "최적화된 이미지로 빠른 로딩"
});
```

### 2. 딥링크 처리

```javascript
// 앱에서 딥링크 처리
document.addEventListener('deviceready', function() {
    // 딥링크 이벤트 리스너
    window.addEventListener('deepLink', function(event) {
        var deepLink = event.detail;
        console.log("딥링크 수신:", deepLink);

        // 딥링크에 따른 화면 이동
        if (deepLink.startsWith('myapp://detail/')) {
            var id = deepLink.split('/').pop();
            navigateToDetail(id);
        }
    });
});
```

### 3. 알림 권한 요청

```javascript
// 알림 권한 요청
FirebasePlugin.grantPermission(function(granted) {
    if (granted) {
        console.log("알림 권한 허용됨");
        // 리치 알림 기능 사용 가능
    } else {
        console.log("알림 권한 거부됨");
        // 사용자에게 설정에서 권한 허용 요청
    }
});
```

## 문제 해결

### 1. 이미지가 표시되지 않는 경우
- 이미지 URL이 HTTPS인지 확인
- 이미지 파일이 실제로 존재하는지 확인
- 네트워크 연결 상태 확인

### 2. 확장 화면이 표시되지 않는 경우
- Notification Content Extension이 올바르게 설정되었는지 확인
- Bundle ID가 올바른지 확인
- Provisioning Profile이 올바른지 확인
- Apple Developer에서 **Push Notifications** Capability가 활성화되었는지 확인

### 3. 알림이 수신되지 않는 경우
- FCM 토큰이 올바른지 확인
- 서버에서 올바른 페이로드 형식으로 전송하는지 확인
- 앱의 알림 권한이 허용되었는지 확인
- Apple Developer에서 **Push Notifications** Capability가 활성화되었는지 확인

## 성능 최적화

1. **이미지 크기**: 10MB 이하, 300x300 픽셀 권장
2. **이미지 형식**: PNG는 투명도가 필요한 경우, JPG는 일반적인 경우
3. **캐싱**: 자주 사용되는 이미지는 로컬에 캐시
4. **네트워크**: WiFi 환경에서 이미지 다운로드 권장

## 보안 고려사항

1. **HTTPS**: 모든 이미지 URL은 HTTPS여야 함
2. **인증**: 민감한 이미지는 적절한 인증 필요
3. **검증**: 서버에서 이미지 URL 검증
4. **제한**: 이미지 크기 및 형식 제한 설정

## 추가 리소스

- [Apple Notification Service Extension 가이드](https://developer.apple.com/documentation/usernotifications/unnotificationserviceextension)
- [Apple Notification Content Extension 가이드](https://developer.apple.com/documentation/usernotificationsui/unnotificationcontentextension)
- [Firebase Cloud Messaging 문서](https://firebase.google.com/docs/cloud-messaging)
