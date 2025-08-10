import UIKit
import UserNotifications
import UserNotificationsUI

class NotificationViewController: UIViewController, UNNotificationContentExtension {

    // MARK: - UI Components

    private let scrollView = UIScrollView()
    private let contentView = UIView()
    private let imageView = UIImageView()
    private let titleLabel = UILabel()
    private let descriptionLabel = UILabel()
    private let actionButton = UIButton(type: .system)

    // MARK: - Properties

    private var notificationData: [AnyHashable: Any] = [:]

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupConstraints()
    }

    // MARK: - UNNotificationContentExtension

        func didReceive(_ notification: UNNotification) {
        print("📱 [NotificationViewController] didReceive called")
        print("📱 [NotificationViewController] Notification title: \(notification.request.content.title)")

        notificationData = notification.request.content.userInfo
        print("📱 [NotificationViewController] UserInfo: \(notificationData)")

        // 제목 설정
        titleLabel.text = notification.request.content.title
        print("📱 [NotificationViewController] Title set: \(notification.request.content.title)")

        // 설명 설정
        if let description = notificationData["notification_description"] as? String {
            descriptionLabel.text = description
            descriptionLabel.isHidden = false
            print("📱 [NotificationViewController] Description set: \(description)")
        } else {
            descriptionLabel.isHidden = true
            print("📱 [NotificationViewController] No description found")
        }

        // 이미지 설정
        print("📱 [NotificationViewController] Attachments count: \(notification.request.content.attachments.count)")
        if let attachment = notification.request.content.attachments.first {
            print("📱 [NotificationViewController] Found attachment: \(attachment.identifier)")
            loadImage(from: attachment)
        } else {
            print("📱 [NotificationViewController] No attachments found")
        }

        // 액션 버튼 설정
        if let actionTitle = notificationData["action_title"] as? String {
            actionButton.setTitle(actionTitle, for: .normal)
            actionButton.isHidden = false
            print("📱 [NotificationViewController] Action button set: \(actionTitle)")
        } else {
            actionButton.isHidden = true
            print("📱 [NotificationViewController] No action button")
        }

        // 배경색 설정
        if let backgroundColor = notificationData["notification_background_color"] as? String {
            view.backgroundColor = UIColor(hex: backgroundColor)
            print("📱 [NotificationViewController] Background color set: \(backgroundColor)")
        } else {
            print("📱 [NotificationViewController] No background color specified")
        }
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = UIColor.systemBackground

        // ScrollView 설정
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.showsVerticalScrollIndicator = false
        view.addSubview(scrollView)

        // ContentView 설정
        contentView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentView)

        // ImageView 설정
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .scaleAspectFit
        imageView.clipsToBounds = true
        imageView.layer.cornerRadius = 8
        contentView.addSubview(imageView)

        // TitleLabel 설정
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = UIFont.boldSystemFont(ofSize: 18)
        titleLabel.textColor = UIColor.label
        titleLabel.numberOfLines = 0
        titleLabel.textAlignment = .center
        contentView.addSubview(titleLabel)

        // DescriptionLabel 설정
        descriptionLabel.translatesAutoresizingMaskIntoConstraints = false
        descriptionLabel.font = UIFont.systemFont(ofSize: 14)
        descriptionLabel.textColor = UIColor.secondaryLabel
        descriptionLabel.numberOfLines = 0
        descriptionLabel.textAlignment = .center
        contentView.addSubview(descriptionLabel)

        // ActionButton 설정
        actionButton.translatesAutoresizingMaskIntoConstraints = false
        actionButton.backgroundColor = UIColor.systemBlue
        actionButton.setTitleColor(UIColor.white, for: .normal)
        actionButton.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .medium)
        actionButton.layer.cornerRadius = 8
        actionButton.addTarget(self, action: #selector(actionButtonTapped), for: .touchUpInside)
        contentView.addSubview(actionButton)
    }

    private func setupConstraints() {
        NSLayoutConstraint.activate([
            // ScrollView
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            // ContentView
            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor),

            // ImageView
            imageView.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 16),
            imageView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            imageView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            imageView.heightAnchor.constraint(equalTo: imageView.widthAnchor, multiplier: 0.6),

            // TitleLabel
            titleLabel.topAnchor.constraint(equalTo: imageView.bottomAnchor, constant: 16),
            titleLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),

            // DescriptionLabel
            descriptionLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            descriptionLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            descriptionLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),

            // ActionButton
            actionButton.topAnchor.constraint(equalTo: descriptionLabel.bottomAnchor, constant: 16),
            actionButton.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            actionButton.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            actionButton.heightAnchor.constraint(equalToConstant: 44),
            actionButton.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -16)
        ])
    }

    // MARK: - Image Loading

        private func loadImage(from attachment: UNNotificationAttachment) {
        print("🖼️ [NotificationViewController] loadImage called for attachment: \(attachment.identifier)")
        let url = attachment.url
        print("🖼️ [NotificationViewController] Image URL: \(url)")

        // 파일이 존재하는지 확인
        guard FileManager.default.fileExists(atPath: url.path) else {
            print("❌ [NotificationViewController] Image file does not exist at path: \(url.path)")
            return
        }

        do {
            let data = try Data(contentsOf: url)
            print("✅ [NotificationViewController] Loaded \(data.count) bytes from image file")

            let image = UIImage(data: data)
            if let image = image {
                print("✅ [NotificationViewController] Image created successfully, size: \(image.size)")
                DispatchQueue.main.async { [weak self] in
                    self?.imageView.image = image
                    print("✅ [NotificationViewController] Image set to imageView")
                }
            } else {
                print("❌ [NotificationViewController] Failed to create UIImage from data")
            }
        } catch {
            print("❌ [NotificationViewController] Failed to load image: \(error)")
        }
    }

    // MARK: - Actions

    @objc private func actionButtonTapped() {
        // 딥링크 처리
        if let deepLink = notificationData["deep_link"] as? String {
            // 딥링크 URL을 처리하는 로직
            print("Deep link: \(deepLink)")
        }

        // 액션 버튼 탭 이벤트 처리
        if let actionData = notificationData["action_data"] as? [String: Any] {
            print("Action data: \(actionData)")
        }
    }
}

// MARK: - UIColor Extension

extension UIColor {
    convenience init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            alpha: Double(a) / 255
        )
    }
}
