var helper = require("./helper");
var fs = require('fs');
var path = require('path');

module.exports = function(context) {
    console.log("cordova-plugin-firebasex: Starting after_plugin_install hook");

    // Check if source files exist
    var sourceFiles = [
        'src/ios/FirebasePlugin.m',
        'src/ios/FirebasePlugin.h',
        'src/ios/AppDelegate+FirebasePlugin.m',
        'src/ios/AppDelegate+FirebasePlugin.h',
        'src/ios/NotificationService.swift',
        'src/ios/NotificationViewController.swift'
    ];

    console.log("cordova-plugin-firebasex: Checking source files...");
    sourceFiles.forEach(function(file) {
        var fullPath = path.join(context.opts.projectRoot, file);
        if (fs.existsSync(fullPath)) {
            console.log("cordova-plugin-firebasex: ✓ " + file + " exists");
        } else {
            console.log("cordova-plugin-firebasex: ✗ " + file + " NOT FOUND");
        }
    });

    // Add a build phase which runs a shell script that executes the Crashlytics
    // run command line tool which uploads the debug symbols at build time.
    var xcodeProjectPath = helper.getXcodeProjectPath();
    console.log("cordova-plugin-firebasex: Xcode project path: " + xcodeProjectPath);

    if (fs.existsSync(xcodeProjectPath)) {
        console.log("cordova-plugin-firebasex: ✓ Xcode project file exists");
    } else {
        console.log("cordova-plugin-firebasex: ✗ Xcode project file NOT FOUND");
        return;
    }

    helper.removeShellScriptBuildPhase(context, xcodeProjectPath);
    helper.addShellScriptBuildPhase(context, xcodeProjectPath);
    helper.addGoogleTagManagerContainer(context, xcodeProjectPath);

    // Setup Notification Service Extension and Content Extension
    console.log("cordova-plugin-firebasex: Setting up notification extensions...");

    // Extension 설정 상태 확인
    var shouldSetupService = helper.shouldSetupNotificationService(context);
    var shouldSetupContent = helper.shouldSetupNotificationContent(context);

    console.log("cordova-plugin-firebasex: shouldSetupNotificationService: " + shouldSetupService);
    console.log("cordova-plugin-firebasex: shouldSetupNotificationContent: " + shouldSetupContent);

    // Extension이 비활성화된 경우 기존 Extension들 제거
    if (!shouldSetupService && !shouldSetupContent) {
        console.log("cordova-plugin-firebasex: Notification extensions are disabled, removing existing extensions...");
        helper.removeExistingExtensions(context, xcodeProjectPath);
    } else {
        // Extension이 활성화된 경우 설정
        console.log("cordova-plugin-firebasex: Notification extensions are enabled, setting up...");
        helper.setupNotificationExtensions(context, xcodeProjectPath);
    }

    // Note: GoogleService-Info.plist copying is handled by project-specific prepare hooks
    console.log("cordova-plugin-firebasex: Extensions created. GoogleService-Info.plist will be copied during prepare phase.");

    console.log("cordova-plugin-firebasex: after_plugin_install hook completed");
};
