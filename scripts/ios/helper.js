var fs = require("fs");
var path = require("path");
var utilities = require("../lib/utilities");
var xcode = require("xcode");
var plist = require('plist');

/**
 * This is used as the display text for the build phase block in XCode as well as the
 * inline comments inside of the .pbxproj file for the build script phase block.
 */
var comment = "\"Crashlytics\"";

var versionRegex = /\d+\.\d+\.\d+[^'"]*/,
    firebasePodRegex = /pod 'Firebase([^']+)', '(\d+\.\d+\.\d+[^'"]*)'/g,
    inAppMessagingPodRegEx = /pod 'FirebaseInAppMessaging', '(\d+\.\d+\.\d+[^'"]*)'/,
    standardFirestorePodRegEx = /pod 'FirebaseFirestore', '(\d+\.\d+\.\d+[^'"]*)'/,
    googleSignInPodRegEx = /pod 'GoogleSignIn', '(\d+\.\d+\.\d+[^'"]*)'/,
    googleTagManagerPodRegEx = /pod 'GoogleTagManager', '(\d+\.\d+\.\d+[^'"]*)'/,
    prebuiltFirestorePodRegEx = /pod 'FirebaseFirestore', :tag => '(\d+\.\d+\.\d+[^'"]*)', :git => 'https:\/\/github.com\/invertase\/firestore-ios-sdk-frameworks.git'/,
    prebuiltFirestorePodTemplate = "pod 'FirebaseFirestore', :tag => '{version}', :git => 'https://github.com/invertase/firestore-ios-sdk-frameworks.git'",
    iosDeploymentTargetPodRegEx = /platform :ios, '(\d+\.\d+\.?\d*)'/;

// Internal functions
function ensureUrlSchemeInPlist(urlScheme, appPlist){
    var appPlistModified = false;
    if(!appPlist['CFBundleURLTypes']) appPlist['CFBundleURLTypes'] = [];
    var entry, entryIndex, i, j, alreadyExists = false;

    for(i=0; i<appPlist['CFBundleURLTypes'].length; i++){
        var thisEntry = appPlist['CFBundleURLTypes'][i];
        if(thisEntry['CFBundleURLSchemes']){
            for(j=0; j<thisEntry['CFBundleURLSchemes'].length; j++){
                if(thisEntry['CFBundleURLSchemes'][j] === urlScheme){
                    alreadyExists = true;
                    break;
                }
            }
        }
        if(thisEntry['CFBundleTypeRole'] === 'Editor'){
            entry = thisEntry;
            entryIndex = i;
        }
    }
    if(!alreadyExists){
        if(!entry) entry = {};
        if(!entry['CFBundleTypeRole']) entry['CFBundleTypeRole'] = 'Editor';
        if(!entry['CFBundleURLSchemes']) entry['CFBundleURLSchemes'] = [];
        entry['CFBundleURLSchemes'].push(urlScheme)
        if(typeof entryIndex === "undefined") entryIndex = i;
        appPlist['CFBundleURLTypes'][entryIndex] = entry;
        appPlistModified = true;
        utilities.log('Added URL scheme "'+urlScheme+'"');
    }

    return {plist: appPlist, modified: appPlistModified}
}

// Public functions
module.exports = {

    /**
     * Used to get the path to the XCode project's .pbxproj file.
     */
    getXcodeProjectPath: function () {
        var appName = utilities.getAppName();
        return path.join("platforms", "ios", appName + ".xcodeproj", "project.pbxproj");
    },

    /**
     * This helper is used to add a build phase to the XCode project which runs a shell
     * script during the build process. The script executes Crashlytics run command line
     * tool with the API and Secret keys. This tool is used to upload the debug symbols
     * (dSYMs) so that Crashlytics can display stack trace information in it's web console.
     */
    addShellScriptBuildPhase: function (context, xcodeProjectPath) {

        // Read and parse the XCode project (.pxbproj) from disk.
        // File format information: http://www.monobjc.net/xcode-project-file-format.html
        var xcodeProject = xcode.project(xcodeProjectPath);
        xcodeProject.parseSync();

        // Build the body of the script to be executed during the build phase.
        var script = '"' + '\\"${PODS_ROOT}/FirebaseCrashlytics/run\\"' + '"';

        // Generate a unique ID for our new build phase.
        var id = xcodeProject.generateUuid();
        // Create the build phase.
        if (!xcodeProject.hash.project.objects.PBXShellScriptBuildPhase) {
            xcodeProject.hash.project.objects.PBXShellScriptBuildPhase = {};
        }

        xcodeProject.hash.project.objects.PBXShellScriptBuildPhase[id] = {
            isa: "PBXShellScriptBuildPhase",
            buildActionMask: 2147483647,
            files: [],
            inputPaths: [
                '"' + '${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}' + '"',
                '"' + '${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${PRODUCT_NAME}' + '"',
                '"' + '${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Info.plist' + '"',
                '"' + '$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/GoogleService-Info.plist' + '"',
                '"' + '$(TARGET_BUILD_DIR)/$(EXECUTABLE_PATH)' + '"',
            ],
            name: comment,
            outputPaths: [],
            runOnlyForDeploymentPostprocessing: 0,
            shellPath: "/bin/sh",
            shellScript: script,
            showEnvVarsInLog: 0
        };

        // Add a comment to the block (viewable in the source of the pbxproj file).
        xcodeProject.hash.project.objects.PBXShellScriptBuildPhase[id + "_comment"] = comment;

        // Add this new shell script build phase block to the targets.
        for (var nativeTargetId in xcodeProject.hash.project.objects.PBXNativeTarget) {

            // Skip over the comment blocks.
            if (nativeTargetId.indexOf("_comment") !== -1) {
                continue;
            }

            var nativeTarget = xcodeProject.hash.project.objects.PBXNativeTarget[nativeTargetId];

            nativeTarget.buildPhases.push({
                value: id,
                comment: comment
            });
        }

        // Finally, write the .pbxproj back out to disk.
        fs.writeFileSync(path.resolve(xcodeProjectPath), xcodeProject.writeSync());
    },

    /**
     * This helper is used to remove the build phase from the XCode project that was added
     * by the addShellScriptBuildPhase() helper method.
     */
    removeShellScriptBuildPhase: function (context, xcodeProjectPath) {

        // Read and parse the XCode project (.pxbproj) from disk.
        // File format information: http://www.monobjc.net/xcode-project-file-format.html
        var xcodeProject = xcode.project(xcodeProjectPath);
        xcodeProject.parseSync();

        // First, we want to delete the build phase block itself.

        var buildPhases = xcodeProject.hash.project.objects.PBXShellScriptBuildPhase;

        var commentTest = comment.replace(/"/g, '');
        for (var buildPhaseId in buildPhases) {

            var buildPhase = xcodeProject.hash.project.objects.PBXShellScriptBuildPhase[buildPhaseId];
            var shouldDelete = false;

            if (buildPhaseId.indexOf("_comment") === -1) {
                // Dealing with a build phase block.

                // If the name of this block matches ours, then we want to delete it.
                shouldDelete = buildPhase.name && buildPhase.name.indexOf(commentTest) !== -1;
            } else {
                // Dealing with a comment block.

                // If this is a comment block that matches ours, then we want to delete it.
                shouldDelete = buildPhase === commentTest;
            }

            if (shouldDelete) {
                delete buildPhases[buildPhaseId];
            }
        }

        // Second, we want to delete the native target reference to the block.

        var nativeTargets = xcodeProject.hash.project.objects.PBXNativeTarget;

        for (var nativeTargetId in nativeTargets) {

            // Skip over the comment blocks.
            if (nativeTargetId.indexOf("_comment") !== -1) {
                continue;
            }

            var nativeTarget = nativeTargets[nativeTargetId];

            // We remove the reference to the block by filtering out the the ones that match.
            nativeTarget.buildPhases = nativeTarget.buildPhases.filter(function (buildPhase) {
                return buildPhase.comment !== commentTest;
            });
        }

        // Finally, write the .pbxproj back out to disk.
        fs.writeFileSync(path.resolve(xcodeProjectPath), xcodeProject.writeSync());
    },

    addGoogleTagManagerContainer: function (context, xcodeProjectPath) {
        const appName = utilities.getAppName();
        const containerDirectorySource = `${context.opts.projectRoot}/resources/ios/container`;
        const containerDirectoryTarget = `platforms/ios/${appName}/container`;
        const xcodeProject = xcode.project(xcodeProjectPath);
        xcodeProject.parseSync();

        if (utilities.directoryExists(containerDirectorySource)) {
            utilities.log(`Preparing GoogleTagManager on iOS`);
            try {
                fs.cpSync(containerDirectorySource, containerDirectoryTarget, {recursive: true});
                const appPBXGroup = xcodeProject.findPBXGroupKey({name: appName})
                xcodeProject.addResourceFile('container', {
                    lastKnownFileType: 'folder',
                    fileEncoding: 9
                }, appPBXGroup);
                fs.writeFileSync(path.resolve(xcodeProjectPath), xcodeProject.writeSync());
            } catch (error) {
                utilities.error(error);
            }
        }
    },

    removeGoogleTagManagerContainer: function (context, xcodeProjectPath) {
        const appName = utilities.getAppName();
        const appContainerDirectory = `platforms/ios/${appName}/container`;
        const xcodeProject = xcode.project(xcodeProjectPath);
        xcodeProject.parseSync();
        if(utilities.directoryExists(appContainerDirectory)){
            utilities.log(`Remove GoogleTagManager container`);
            const appPBXGroup = xcodeProject.findPBXGroupKey({name: appName})
            xcodeProject.removeResourceFile('container', {
                lastKnownFileType: 'folder',
                fileEncoding: 9
            }, appPBXGroup);
            fs.writeFileSync(path.resolve(xcodeProjectPath), xcodeProject.writeSync());
            fs.rmSync(appContainerDirectory, {recursive: true});
        }
    },

    ensureRunpathSearchPath: function(context, xcodeProjectPath){

        function addRunpathSearchBuildProperty(proj, build) {
            let LD_RUNPATH_SEARCH_PATHS = proj.getBuildProperty("LD_RUNPATH_SEARCH_PATHS", build);

            if (!Array.isArray(LD_RUNPATH_SEARCH_PATHS)) {
                LD_RUNPATH_SEARCH_PATHS = [LD_RUNPATH_SEARCH_PATHS];
            }

            LD_RUNPATH_SEARCH_PATHS.forEach(LD_RUNPATH_SEARCH_PATH => {
                if (!LD_RUNPATH_SEARCH_PATH) {
                    proj.addBuildProperty("LD_RUNPATH_SEARCH_PATHS", "\"$(inherited) @executable_path/Frameworks\"", build);
                }
                if (LD_RUNPATH_SEARCH_PATH.indexOf("@executable_path/Frameworks") == -1) {
                    var newValue = LD_RUNPATH_SEARCH_PATH.substr(0, LD_RUNPATH_SEARCH_PATH.length - 1);
                    newValue += ' @executable_path/Frameworks\"';
                    proj.updateBuildProperty("LD_RUNPATH_SEARCH_PATHS", newValue, build);
                }
                if (LD_RUNPATH_SEARCH_PATH.indexOf("$(inherited)") == -1) {
                    var newValue = LD_RUNPATH_SEARCH_PATH.substr(0, LD_RUNPATH_SEARCH_PATH.length - 1);
                    newValue += ' $(inherited)\"';
                    proj.updateBuildProperty("LD_RUNPATH_SEARCH_PATHS", newValue, build);
                }
            });
        }

        // Read and parse the XCode project (.pxbproj) from disk.
        // File format information: http://www.monobjc.net/xcode-project-file-format.html
        var xcodeProject = xcode.project(xcodeProjectPath);
        xcodeProject.parseSync();

        // Add search paths build property
        addRunpathSearchBuildProperty(xcodeProject, "Debug");
        addRunpathSearchBuildProperty(xcodeProject, "Release");

        // Finally, write the .pbxproj back out to disk.
        fs.writeFileSync(path.resolve(xcodeProjectPath), xcodeProject.writeSync());
    },
    applyPodsPostInstall: function(pluginVariables, iosPlatform){
        var podFileModified = false,
            podFilePath = path.resolve(iosPlatform.podFile);

        // check if file exists
        if(!fs.existsSync(podFilePath)){
            utilities.warn(`Podfile not found at ${podFilePath}`);
            return false;
        }

        var podFile = fs.readFileSync(podFilePath).toString(),
            DEBUG_INFORMATION_FORMAT = pluginVariables['IOS_STRIP_DEBUG'] && pluginVariables['IOS_STRIP_DEBUG'] === 'true' ? 'dwarf' : 'dwarf-with-dsym',
            iosDeploymentTargetMatch = podFile.match(iosDeploymentTargetPodRegEx),
            IPHONEOS_DEPLOYMENT_TARGET = iosDeploymentTargetMatch ? iosDeploymentTargetMatch[1] : null;

        if(!podFile.match('post_install')){
            podFile += `
post_install do |installer|
    installer.pods_project.targets.each do |target|
        target.build_configurations.each do |config|
            config.build_settings['DEBUG_INFORMATION_FORMAT'] = '${DEBUG_INFORMATION_FORMAT}'
            ${IPHONEOS_DEPLOYMENT_TARGET ? "config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '"+IPHONEOS_DEPLOYMENT_TARGET + "'" : ""}
            if target.respond_to?(:product_type) and target.product_type == "com.apple.product-type.bundle"
                config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
            end
        end
    end
end
                `;
            fs.writeFileSync(path.resolve(podFilePath), podFile);
            utilities.log('Applied post install block to Podfile');
            podFileModified = true;
        }
        return podFileModified;
    },
    applyPluginVarsToPlists: function(pluginVariables, iosPlatform){
        var googlePlistPath = path.resolve(iosPlatform.dest);
        if(!fs.existsSync(googlePlistPath)){
            utilities.warn(`Google plist not found at ${googlePlistPath}`);
            return;
        }

        var appPlistPath = path.resolve(iosPlatform.appPlist);
        if(!fs.existsSync(appPlistPath)){
            utilities.warn(`App plist not found at ${appPlistPath}`);
            return;
        }

        var entitlementsDebugPlistPath = path.resolve(iosPlatform.entitlementsDebugPlist);
        if(!fs.existsSync(entitlementsDebugPlistPath)){
            utilities.warn(`Entitlements debug plist not found at ${entitlementsDebugPlistPath}`);
            return;
        }

        var entitlementsReleasePlistPath = path.resolve(iosPlatform.entitlementsReleasePlist);
        if(!fs.existsSync(entitlementsReleasePlistPath)){
            utilities.warn(`Entitlements release plist not found at ${entitlementsReleasePlistPath}`);
            return;
        }

        var googlePlist = plist.parse(fs.readFileSync(googlePlistPath, 'utf8')),
            appPlist = plist.parse(fs.readFileSync(appPlistPath, 'utf8')),
            entitlementsDebugPlist = plist.parse(fs.readFileSync(entitlementsDebugPlistPath, 'utf8')),
            entitlementsReleasePlist = plist.parse(fs.readFileSync(entitlementsReleasePlistPath, 'utf8')),
            googlePlistModified = false,
            appPlistModified = false,
            entitlementsPlistsModified = false;

        if(typeof pluginVariables['FIREBASE_ANALYTICS_COLLECTION_ENABLED'] !== 'undefined'){
            googlePlist["FIREBASE_ANALYTICS_COLLECTION_ENABLED"] = (pluginVariables['FIREBASE_ANALYTICS_COLLECTION_ENABLED'] !== "false" ? "true" : "false") ;
            googlePlistModified = true;
        }
        if(typeof pluginVariables['FIREBASE_PERFORMANCE_COLLECTION_ENABLED'] !== 'undefined'){
            googlePlist["FIREBASE_PERFORMANCE_COLLECTION_ENABLED"] = (pluginVariables['FIREBASE_PERFORMANCE_COLLECTION_ENABLED'] !== "false" ? "true" : "false") ;
            googlePlistModified = true;
        }
        if(typeof pluginVariables['FIREBASE_CRASHLYTICS_COLLECTION_ENABLED'] !== 'undefined'){
            googlePlist["FirebaseCrashlyticsCollectionEnabled"] = (pluginVariables['FIREBASE_CRASHLYTICS_COLLECTION_ENABLED'] !== "false" ? "true" : "false") ;
            googlePlistModified = true;
        }
        if (typeof pluginVariables['GOOGLE_ANALYTICS_ADID_COLLECTION_ENABLED'] !== 'undefined') {
            googlePlist["GOOGLE_ANALYTICS_ADID_COLLECTION_ENABLED"] = (pluginVariables['GOOGLE_ANALYTICS_ADID_COLLECTION_ENABLED'] !== "false" ? "true" : "false");
            googlePlistModified = true;
        }
        if (typeof pluginVariables['GOOGLE_ANALYTICS_DEFAULT_ALLOW_ANALYTICS_STORAGE'] !== 'undefined') {
            googlePlist["GOOGLE_ANALYTICS_DEFAULT_ALLOW_ANALYTICS_STORAGE"] = (pluginVariables['GOOGLE_ANALYTICS_DEFAULT_ALLOW_ANALYTICS_STORAGE'] !== "false" ? "true" : "false");
            googlePlistModified = true;
        }
        if (typeof pluginVariables['GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_STORAGE'] !== 'undefined') {
            googlePlist["GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_STORAGE"] = (pluginVariables['GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_STORAGE'] !== "false" ? "true" : "false");
            googlePlistModified = true;
        }
        if (typeof pluginVariables['GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_USER_DATA'] !== 'undefined') {
            googlePlist["GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_USER_DATA"] = (pluginVariables['GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_USER_DATA'] !== "false" ? "true" : "false");
            googlePlistModified = true;
        }
        if (typeof pluginVariables['GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_PERSONALIZATION_SIGNALS'] !== 'undefined') {
            googlePlist["GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_PERSONALIZATION_SIGNALS"] = (pluginVariables['GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_PERSONALIZATION_SIGNALS'] !== "false" ? "true" : "false");
            googlePlistModified = true;
        }
        if(typeof pluginVariables['IOS_SHOULD_ESTABLISH_DIRECT_CHANNEL'] !== 'undefined'){
            appPlist["shouldEstablishDirectChannel"] = (pluginVariables['IOS_SHOULD_ESTABLISH_DIRECT_CHANNEL'] === "true") ;
            appPlistModified = true;
        }
        if(pluginVariables['SETUP_RECAPTCHA_VERIFICATION'] === 'true'){
            var reversedClientId = googlePlist['REVERSED_CLIENT_ID'];
            var result = ensureUrlSchemeInPlist(reversedClientId, appPlist);
            if(result.modified){
                appPlist = result.plist;
                appPlistModified = true;
            }
        }
        if(pluginVariables['IOS_ENABLE_APPLE_SIGNIN'] === 'true'){
            entitlementsDebugPlist["com.apple.developer.applesignin"] = ["Default"];
            entitlementsReleasePlist["com.apple.developer.applesignin"] = ["Default"];
            entitlementsPlistsModified = true;
        }

        if(pluginVariables['IOS_ENABLE_CRITICAL_ALERTS_ENABLED'] === 'true'){
            entitlementsDebugPlist["com.apple.developer.usernotifications.critical-alerts"] = true;
            entitlementsReleasePlist["com.apple.developer.usernotifications.critical-alerts"] = true;
            entitlementsPlistsModified = true;
        }

        if(typeof pluginVariables['FIREBASE_FCM_AUTOINIT_ENABLED'] !== 'undefined'){
            appPlist["FirebaseMessagingAutoInitEnabled"] = (pluginVariables['FIREBASE_FCM_AUTOINIT_ENABLED'] === "true") ;
            appPlistModified = true;
        }

        if(pluginVariables['IOS_FCM_ENABLED'] === 'false'){
            // Use GoogleService-Info.plist to pass this to the native part reducing noise in Info.plist.
            // A prefix should make it more clear that this is not the variable of the SDK.
            googlePlist["FIREBASEX_IOS_FCM_ENABLED"] = false;
            googlePlistModified = true;
            // FCM auto-init must be disabled early via the Info.plist in this case.
            appPlist["FirebaseMessagingAutoInitEnabled"] = false;
            appPlistModified = true;
        }

        if(googlePlistModified) fs.writeFileSync(path.resolve(iosPlatform.dest), plist.build(googlePlist));
        if(appPlistModified) fs.writeFileSync(path.resolve(iosPlatform.appPlist), plist.build(appPlist));
        if(entitlementsPlistsModified){
            fs.writeFileSync(path.resolve(iosPlatform.entitlementsDebugPlist), plist.build(entitlementsDebugPlist));
            fs.writeFileSync(path.resolve(iosPlatform.entitlementsReleasePlist), plist.build(entitlementsReleasePlist));
        }
    },
    applyPluginVarsToPodfile: function(pluginVariables, iosPlatform){
        var podFilePath = path.resolve(iosPlatform.podFile);

        // check if file exists
        if(!fs.existsSync(podFilePath)){
            utilities.warn(`Podfile not found at ${podFilePath}`);
            return false;
        }

        var podFileContents = fs.readFileSync(podFilePath, 'utf8'),
            podFileModified = false,
            specifiedInAppMessagingVersion = false;

        if(pluginVariables['IOS_FIREBASE_IN_APP_MESSAGING_VERSION']){
            if(pluginVariables['IOS_FIREBASE_IN_APP_MESSAGING_VERSION'].match(versionRegex)){
                specifiedInAppMessagingVersion = true;
                var matches = podFileContents.match(inAppMessagingPodRegEx);
                if(matches){
                    matches.forEach((match) => {
                        var currentVersion = match.match(versionRegex)[0];
                        if(!match.match(pluginVariables['IOS_FIREBASE_IN_APP_MESSAGING_VERSION'])){
                            podFileContents = podFileContents.replace(match, match.replace(currentVersion, pluginVariables['IOS_FIREBASE_IN_APP_MESSAGING_VERSION']));
                            podFileModified = true;
                        }
                    });
                    if(podFileModified) utilities.log("Firebase iOS InAppMessaging SDK version set to v"+pluginVariables['IOS_FIREBASE_IN_APP_MESSAGING_VERSION']+" in Podfile");
                }
            }else{
                throw new Error("The value \""+pluginVariables['IOS_FIREBASE_IN_APP_MESSAGING_VERSION']+"\" for IOS_FIREBASE_IN_APP_MESSAGING_VERSION is not a valid semantic version format")
            }
        }

        if(pluginVariables['IOS_FIREBASE_SDK_VERSION']){
            if(pluginVariables['IOS_FIREBASE_SDK_VERSION'].match(versionRegex)){
                var matches = podFileContents.match(firebasePodRegex);
                if(matches){
                    matches.forEach((match) => {
                        if(match.match(inAppMessagingPodRegEx) && specifiedInAppMessagingVersion){
                            return; // Skip Firebase In App Messaging pod if it was specified separately
                        }

                        var currentVersion = match.match(versionRegex)[0];
                        if(!match.match(pluginVariables['IOS_FIREBASE_SDK_VERSION'])){
                            podFileContents = podFileContents.replace(match, match.replace(currentVersion, pluginVariables['IOS_FIREBASE_SDK_VERSION']));
                            podFileModified = true;
                        }
                    });
                }
                var prebuiltFirestoreMatches = podFileContents.match(prebuiltFirestorePodRegEx);
                if(prebuiltFirestoreMatches){
                    prebuiltFirestoreMatches.forEach((match) => {
                        var currentVersion = match.match(versionRegex)[0];
                        if(!match.match(pluginVariables['IOS_FIREBASE_SDK_VERSION'])){
                            podFileContents = podFileContents.replace(match, match.replace(currentVersion, pluginVariables['IOS_FIREBASE_SDK_VERSION']));
                            podFileModified = true;
                        }
                    });
                }
                if(podFileModified) utilities.log("Firebase iOS SDK version set to v"+pluginVariables['IOS_FIREBASE_SDK_VERSION']+" in Podfile");
            }else{
                throw new Error("The value \""+pluginVariables['IOS_FIREBASE_SDK_VERSION']+"\" for IOS_FIREBASE_SDK_VERSION is not a valid semantic version format")
            }
        }

        if(pluginVariables['IOS_GOOGLE_SIGIN_VERSION']){
            if(pluginVariables['IOS_GOOGLE_SIGIN_VERSION'].match(versionRegex)){
                var matches = podFileContents.match(googleSignInPodRegEx);
                if(matches){
                    matches.forEach((match) => {
                        var currentVersion = match.match(versionRegex)[0];
                        if(!match.match(pluginVariables['IOS_GOOGLE_SIGIN_VERSION'])){
                            podFileContents = podFileContents.replace(match, match.replace(currentVersion, pluginVariables['IOS_GOOGLE_SIGIN_VERSION']));
                            podFileModified = true;
                        }
                    });
                    if(podFileModified) utilities.log("Google Sign In version set to v"+pluginVariables['IOS_GOOGLE_SIGIN_VERSION']+" in Podfile");
                }
            }else{
                throw new Error("The value \""+pluginVariables['IOS_GOOGLE_SIGIN_VERSION']+"\" for IOS_GOOGLE_SIGIN_VERSION is not a valid semantic version format")
            }
        }

        if(pluginVariables['IOS_GOOGLE_TAG_MANAGER_VERSION']){
            if(pluginVariables['IOS_GOOGLE_TAG_MANAGER_VERSION'].match(versionRegex)){
                var matches = podFileContents.match(googleTagManagerPodRegEx);
                if(matches){
                    matches.forEach((match) => {
                        var currentVersion = match.match(versionRegex)[0];
                        if(!match.match(pluginVariables['IOS_GOOGLE_TAG_MANAGER_VERSION'])){
                            podFileContents = podFileContents.replace(match, match.replace(currentVersion, pluginVariables['IOS_GOOGLE_TAG_MANAGER_VERSION']));
                            podFileModified = true;
                        }
                    });
                    if(podFileModified) utilities.log("Google Tag Manager version set to v"+pluginVariables['IOS_GOOGLE_TAG_MANAGER_VERSION']+" in Podfile");
                }
            }else{
                throw new Error("The value \""+pluginVariables['IOS_GOOGLE_TAG_MANAGER_VERSION']+"\" for IOS_GOOGLE_TAG_MANAGER_VERSION is not a valid semantic version format")
            }
        }

        if(pluginVariables['IOS_USE_PRECOMPILED_FIRESTORE_POD'] === 'true'){
            if(process.env.SKIP_FIREBASE_FIRESTORE_SWIFT){
                var standardFirestorePodMatches = podFileContents.match(standardFirestorePodRegEx);
                if(standardFirestorePodMatches){
                    podFileContents = podFileContents.replace(standardFirestorePodMatches[0], prebuiltFirestorePodTemplate.replace('{version}', standardFirestorePodMatches[1]));
                    podFileModified = true;
                    utilities.log("Configured Podfile for pre-built Firestore pod");
                }
            }else{
                throw new Error("The environment variable SKIP_FIREBASE_FIRESTORE_SWIFT is not set. This is required to use the pre-built Firestore pod.")
            }
        }
        if(podFileModified) {
            fs.writeFileSync(path.resolve(iosPlatform.podFile), podFileContents);
        }

        return podFileModified;
    },
    /**
     * XCode 프로젝트의 필요한 객체들을 초기화합니다.
     */
    initializeXcodeObjects: function(xcodeProject) {
        var objectTypes = [
            'PBXFileReference',
            'PBXBuildFile',
            'PBXSourcesBuildPhase',
            'PBXFrameworksBuildPhase',
            'PBXResourcesBuildPhase',
            'PBXCopyFilesBuildPhase',
            'XCConfigurationList',
            'XCBuildConfiguration',
            'PBXNativeTarget',
            'PBXGroup'
        ];

        objectTypes.forEach(function(type) {
            if (!xcodeProject.hash.project.objects[type]) {
                xcodeProject.hash.project.objects[type] = {};
            }
        });
    },

    ensureEncodedAppIdInUrlSchemes: function (iosPlatform){
        var googlePlistPath = path.resolve(iosPlatform.dest);
        if(!fs.existsSync(googlePlistPath)){
            utilities.warn(`Google plist not found at ${googlePlistPath}`);
            return;
        }

        var appPlistPath = path.resolve(iosPlatform.appPlist);
        if(!fs.existsSync(appPlistPath)){
            utilities.warn(`App plist not found at ${appPlistPath}`);
            return;
        }

        var googlePlist = plist.parse(fs.readFileSync(googlePlistPath, 'utf8')),
            appPlist = plist.parse(fs.readFileSync(appPlistPath, 'utf8')),
            googleAppId = googlePlist["GOOGLE_APP_ID"];

        if(!googleAppId){
            utilities.warn("Google App ID not found in Google plist");
            return;
        }

        var encodedAppId = 'app-'+googleAppId.replace(/:/g,'-');

        var result = ensureUrlSchemeInPlist(encodedAppId, appPlist);
        if(result.modified){
            fs.writeFileSync(path.resolve(iosPlatform.appPlist), plist.build(result.plist));
        }
    },

    /**
     * Notification Service Extension과 Content Extension을 설정합니다.
     */
    setupNotificationExtensions: function(context, xcodeProjectPath) {
        try {
            var xcodeProject = xcode.project(xcodeProjectPath);
            xcodeProject.parseSync();

            var appName = utilities.getAppName();
            var bundleId = this.getBundleId(context);

            utilities.log("Setting up notification extensions for app: " + appName + " with bundle ID: " + bundleId);

            // 메인 앱에서 Extension 파일들 제거 (중복 방지)
            this.removeExtensionFilesFromMainApp(xcodeProject, appName);

            // Notification Service Extension 설정
            if (this.shouldSetupNotificationService(context)) {
                if (!this.extensionExists(xcodeProject, "NotificationService")) {
                    utilities.log("Creating Notification Service Extension...");
                    this.createNotificationServiceExtension(context, xcodeProject, appName, bundleId);
                } else {
                    utilities.log("Notification Service Extension already exists, skipping creation");
                }
            } else {
                utilities.log("Notification Service Extension is disabled");
            }

            // Notification Content Extension 설정
            if (this.shouldSetupNotificationContent(context)) {
                if (!this.extensionExists(xcodeProject, "NotificationContent")) {
                    utilities.log("Creating Notification Content Extension...");
                    this.createNotificationContentExtension(context, xcodeProject, appName, bundleId);
                } else {
                    utilities.log("Notification Content Extension already exists, skipping creation");
                }
            } else {
                utilities.log("Notification Content Extension is disabled");
            }

            // 프로젝트 저장 전 문법 수정
            var projectContent = xcodeProject.writeSync();
            projectContent = this.fixProjectSyntax(projectContent);
            fs.writeFileSync(path.resolve(xcodeProjectPath), projectContent);
            utilities.log("Notification extensions setup completed successfully");

        } catch (error) {
            utilities.error("Failed to setup notification extensions: " + error.message);
            throw error;
        }
    },

    extensionExists: function(xcodeProject, extensionName) {
        // Extension Target이 이미 존재하는지 확인
        var targets = xcodeProject.hash.project.objects.PBXNativeTarget;
        for (var targetId in targets) {
            if (targetId.indexOf("_comment") === -1) {
                var target = targets[targetId];
                if (target.name === extensionName) {
                    return true;
                }
            }
        }

        // Extension 디렉토리가 존재하는지 확인
        var appName = utilities.getAppName();
        var extensionDir = path.join("platforms", "ios", appName, extensionName);
        if (fs.existsSync(extensionDir)) {
            return true;
        }

        return false;
    },

    shouldSetupNotificationService: function(context) {
        try {
            // 여러 방법으로 플러그인 변수에 접근 시도
            var pluginVariables = null;

            if (context.opts.plugin && context.opts.plugin.pluginInfo && context.opts.plugin.pluginInfo._et && context.opts.plugin.pluginInfo._et._configs) {
                pluginVariables = context.opts.plugin.pluginInfo._et._configs['cordova-plugin-firebasex'];
            }

            if (!pluginVariables && context.opts.plugin && context.opts.plugin.pluginInfo && context.opts.plugin.pluginInfo.variables) {
                pluginVariables = context.opts.plugin.pluginInfo.variables;
            }

            if (!pluginVariables && context.opts.plugin && context.opts.plugin.pluginInfo && context.opts.plugin.pluginInfo._et && context.opts.plugin.pluginInfo._et.variables) {
                pluginVariables = context.opts.plugin.pluginInfo._et.variables;
            }

            // 기본값으로 true 반환 (Extension 활성화)
            var result = true;
            if (pluginVariables && pluginVariables['IOS_NOTIFICATION_SERVICE_ENABLED'] !== undefined) {
                result = pluginVariables['IOS_NOTIFICATION_SERVICE_ENABLED'] === 'true';
            }

            utilities.log("shouldSetupNotificationService: " + result + " (pluginVariables: " + JSON.stringify(pluginVariables) + ")");
            return result;
        } catch (error) {
            utilities.error("Error in shouldSetupNotificationService: " + error.message);
            // 에러 발생 시 기본값으로 true 반환
            return true;
        }
    },

    shouldSetupNotificationContent: function(context) {
        try {
            // 여러 방법으로 플러그인 변수에 접근 시도
            var pluginVariables = null;

            if (context.opts.plugin && context.opts.plugin.pluginInfo && context.opts.plugin.pluginInfo._et && context.opts.plugin.pluginInfo._et._configs) {
                pluginVariables = context.opts.plugin.pluginInfo._et._configs['cordova-plugin-firebasex'];
            }

            if (!pluginVariables && context.opts.plugin && context.opts.plugin.pluginInfo && context.opts.plugin.pluginInfo.variables) {
                pluginVariables = context.opts.plugin.pluginInfo.variables;
            }

            if (!pluginVariables && context.opts.plugin && context.opts.plugin.pluginInfo && context.opts.plugin.pluginInfo._et && context.opts.plugin.pluginInfo._et.variables) {
                pluginVariables = context.opts.plugin.pluginInfo._et.variables;
            }

            // 기본값으로 true 반환 (Extension 활성화)
            var result = true;
            if (pluginVariables && pluginVariables['IOS_NOTIFICATION_CONTENT_ENABLED'] !== undefined) {
                result = pluginVariables['IOS_NOTIFICATION_CONTENT_ENABLED'] === 'true';
            }

            utilities.log("shouldSetupNotificationContent: " + result + " (pluginVariables: " + JSON.stringify(pluginVariables) + ")");
            return result;
        } catch (error) {
            utilities.error("Error in shouldSetupNotificationContent: " + error.message);
            // 에러 발생 시 기본값으로 true 반환
            return true;
        }
    },

    getBundleId: function(context) {
        try {
        var configXml = utilities.parseConfigXml();
            utilities.log("Config XML parsed: " + JSON.stringify(configXml));

            if (!configXml || !configXml.widget) {
                utilities.error("Config XML or widget not found");
                // 기본 Bundle ID 반환
                return "com.hogangnono.hogangnono";
            }

            if (!configXml.widget.$ || !configXml.widget.$.id) {
                utilities.error("Widget ID not found in config XML");
                // 기본 Bundle ID 반환
                return "com.hogangnono.hogangnono";
            }

            var bundleId = configXml.widget.$.id;
            utilities.log("Bundle ID: " + bundleId);
            return bundleId;
        } catch (error) {
            utilities.error("Error getting bundle ID: " + error.message);
            // 에러 발생 시 기본 Bundle ID 반환
            return "com.hogangnono.hogangnono";
        }
    },

    createNotificationServiceExtension: function(context, xcodeProject, appName, bundleId) {
        var EXTENSION_TYPE = "NotificationService";
        var extensionName = EXTENSION_TYPE;
        var extensionBundleId = bundleId + "." + EXTENSION_TYPE;

        utilities.log("Setting up Notification Service Extension: " + extensionName);

        // Extension 디렉토리 생성
        var extensionDir = path.join("platforms", "ios", appName, extensionName);
        if (!fs.existsSync(extensionDir)) {
            fs.mkdirSync(extensionDir, { recursive: true });
        }

        // Info.plist 생성
        this.createExtensionInfoPlist(extensionDir, extensionName, extensionBundleId, EXTENSION_TYPE);

        // 소스 파일 복사
        this.copyExtensionSourceFiles(context, extensionDir, extensionName);

        // 모든 필요한 ID들 미리 생성
        var extensionTargetId = xcodeProject.generateUuid();
        var extensionProductId = xcodeProject.generateUuid();
        var extensionGroupId = xcodeProject.generateUuid();
        var extensionBuildConfigId = xcodeProject.generateUuid();
        var extensionSourcesPhaseId = xcodeProject.generateUuid();
        var extensionFrameworksPhaseId = xcodeProject.generateUuid();
        var extensionResourcesPhaseId = xcodeProject.generateUuid();
        var extensionInfoPlistId = xcodeProject.generateUuid();
        var extensionSwiftFileId = xcodeProject.generateUuid();
        var extensionInfoPlistBuildFileId = xcodeProject.generateUuid();
        var extensionSwiftBuildFileId = xcodeProject.generateUuid();

        // 필요한 객체들 초기화
        this.initializeXcodeObjects(xcodeProject);

        // 1. File References 생성
        xcodeProject.hash.project.objects.PBXFileReference[extensionProductId] = {
            isa: "PBXFileReference",
            explicitFileType: "wrapper.app-extension",
            includeInIndex: 0,
            path: extensionName + ".appex",
            sourceTree: "\"BUILT_PRODUCTS_DIR\""
        };

        xcodeProject.hash.project.objects.PBXFileReference[extensionInfoPlistId] = {
            isa: "PBXFileReference",
            lastKnownFileType: "text.plist.xml",
            path: "Info.plist",
            sourceTree: "\"<group>\""
        };

        xcodeProject.hash.project.objects.PBXFileReference[extensionSwiftFileId] = {
            isa: "PBXFileReference",
            lastKnownFileType: "sourcecode.swift",
            path: "NotificationService.swift",
            sourceTree: "\"<group>\""
        };

        // 2. Build Files 생성
        // Info.plist는 Build Settings에서 참조되므로 Build File로 생성하지 않음
        // xcodeProject.hash.project.objects.PBXBuildFile[extensionInfoPlistBuildFileId] = {
        //     isa: "PBXBuildFile",
        //     fileRef: extensionInfoPlistId
        // };

        xcodeProject.hash.project.objects.PBXBuildFile[extensionSwiftBuildFileId] = {
            isa: "PBXBuildFile",
            fileRef: extensionSwiftFileId
        };

        // 3. Build Phases 생성
        xcodeProject.hash.project.objects.PBXSourcesBuildPhase[extensionSourcesPhaseId] = {
            isa: "PBXSourcesBuildPhase",
            buildActionMask: 2147483647,
            files: [
                extensionSwiftBuildFileId
            ],
            runOnlyForDeploymentPostprocessing: 0
        };

        xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[extensionFrameworksPhaseId] = {
            isa: "PBXFrameworksBuildPhase",
            buildActionMask: 2147483647,
            files: [],
            runOnlyForDeploymentPostprocessing: 0
        };

        xcodeProject.hash.project.objects.PBXResourcesBuildPhase[extensionResourcesPhaseId] = {
            isa: "PBXResourcesBuildPhase",
            buildActionMask: 2147483647,
            files: [
                // Info.plist는 Build Settings의 INFOPLIST_FILE로 지정되므로 Resources Phase에서 제외
            ],
            runOnlyForDeploymentPostprocessing: 0
        };

        // 4. Build Configurations 생성
        var debugConfigId = xcodeProject.generateUuid();
        var releaseConfigId = xcodeProject.generateUuid();

        xcodeProject.hash.project.objects.XCConfigurationList[extensionBuildConfigId] = {
            isa: "XCConfigurationList",
            buildConfigurations: [
                debugConfigId,
                releaseConfigId
            ],
            defaultConfigurationIsVisible: 0,
            defaultConfigurationName: "Release"
        };

        var commonBuildSettings = {
            "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
            "CODE_SIGN_ENTITLEMENTS": "\"" + appName + "/" + extensionName + "/" + extensionName + ".entitlements\"",
            "CODE_SIGN_STYLE": "Automatic",
            "CURRENT_PROJECT_VERSION": "1",
            "DEVELOPMENT_TEAM": "\"\"",
            "GENERATE_INFOPLIST_FILE": "NO",
            "INFOPLIST_FILE": "\"" + appName + "/" + extensionName + "/Info.plist\"",
            "INFOPLIST_KEY_CFBundleDisplayName": "\"" + extensionName + "\"",
            "INFOPLIST_KEY_NSHumanReadableCopyright": "\"\"",
            "LD_RUNPATH_SEARCH_PATHS": "\"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks\"",
            "MARKETING_VERSION": "1.0",
            "PRODUCT_BUNDLE_IDENTIFIER": extensionBundleId,
            "PRODUCT_NAME": "\"$(TARGET_NAME)\"",
            "SKIP_INSTALL": "YES",
            "SWIFT_EMIT_LOC_STRINGS": "YES",
            "TARGETED_DEVICE_FAMILY": "\"1,2\""
        };

        xcodeProject.hash.project.objects.XCBuildConfiguration[debugConfigId] = {
            isa: "XCBuildConfiguration",
            buildSettings: commonBuildSettings,
            name: "Debug"
        };

        xcodeProject.hash.project.objects.XCBuildConfiguration[releaseConfigId] = {
            isa: "XCBuildConfiguration",
            buildSettings: commonBuildSettings,
            name: "Release"
        };

        // 5. Extension Group 생성
        xcodeProject.hash.project.objects.PBXGroup[extensionGroupId] = {
            isa: "PBXGroup",
            children: [
                extensionInfoPlistId,
                extensionSwiftFileId
            ],
            path: extensionName,
            sourceTree: "\"<group>\""
        };

        // 6. Extension Target 생성
        xcodeProject.hash.project.objects.PBXNativeTarget[extensionTargetId] = {
            isa: "PBXNativeTarget",
            buildConfigurationList: extensionBuildConfigId,
            buildPhases: [
                extensionSourcesPhaseId,
                extensionFrameworksPhaseId,
                extensionResourcesPhaseId
            ],
            buildRules: [],
            dependencies: [],
            name: extensionName,
            productName: extensionName,
            productReference: extensionProductId,
            productType: "\"com.apple.product-type.app-extension\""
        };

        // 7. 프로젝트에 추가
        var projectGroup = xcodeProject.findPBXGroupKey({name: appName});
        if (projectGroup) {
            xcodeProject.hash.project.objects.PBXGroup[projectGroup].children.push(extensionGroupId);
        }

        xcodeProject.hash.project.objects.PBXProject[xcodeProject.getFirstProject().uuid].targets.push(extensionTargetId);

        // 7.5. Extension에 Push Notifications capability 추가
        this.addPushNotificationsToExtension(xcodeProject, extensionTargetId, extensionName, appName);

        // 8. 메인 앱에 Embed App Extension 추가
        this.addEmbedAppExtensionToMainApp(xcodeProject, appName, extensionTargetId, extensionProductId, extensionName);

        utilities.log("Notification Service Extension setup completed");
        utilities.log("Extension Target ID: " + extensionTargetId);
        utilities.log("Extension Product ID: " + extensionProductId);
        utilities.log("Extension Bundle ID: " + extensionBundleId);
    },

    createNotificationContentExtension: function(context, xcodeProject, appName, bundleId) {
        var EXTENSION_TYPE = "NotificationContent";
        var extensionName = EXTENSION_TYPE;
        var extensionBundleId = bundleId + "." + EXTENSION_TYPE;

        utilities.log("Setting up Notification Content Extension: " + extensionName);

        // Extension 디렉토리 생성
        var extensionDir = path.join("platforms", "ios", appName, extensionName);
        if (!fs.existsSync(extensionDir)) {
            fs.mkdirSync(extensionDir, { recursive: true });
        }

        // Info.plist 생성
        this.createExtensionInfoPlist(extensionDir, extensionName, extensionBundleId, EXTENSION_TYPE);

        // 소스 파일 복사
        this.copyExtensionSourceFiles(context, extensionDir, extensionName);

        // 모든 필요한 ID들 미리 생성
        var extensionTargetId = xcodeProject.generateUuid();
        var extensionProductId = xcodeProject.generateUuid();
        var extensionGroupId = xcodeProject.generateUuid();
        var extensionBuildConfigId = xcodeProject.generateUuid();
        var extensionSourcesPhaseId = xcodeProject.generateUuid();
        var extensionFrameworksPhaseId = xcodeProject.generateUuid();
        var extensionResourcesPhaseId = xcodeProject.generateUuid();
        var extensionInfoPlistId = xcodeProject.generateUuid();
        var extensionSwiftFileId = xcodeProject.generateUuid();
        var extensionInfoPlistBuildFileId = xcodeProject.generateUuid();
        var extensionSwiftBuildFileId = xcodeProject.generateUuid();

        // 필요한 객체들 초기화
        this.initializeXcodeObjects(xcodeProject);

        // 1. File References 생성
        xcodeProject.hash.project.objects.PBXFileReference[extensionProductId] = {
            isa: "PBXFileReference",
            explicitFileType: "wrapper.app-extension",
            includeInIndex: 0,
            path: extensionName + ".appex",
            sourceTree: "\"BUILT_PRODUCTS_DIR\""
        };

        xcodeProject.hash.project.objects.PBXFileReference[extensionInfoPlistId] = {
            isa: "PBXFileReference",
            lastKnownFileType: "text.plist.xml",
            path: "Info.plist",
            sourceTree: "\"<group>\""
        };

        xcodeProject.hash.project.objects.PBXFileReference[extensionSwiftFileId] = {
            isa: "PBXFileReference",
            lastKnownFileType: "sourcecode.swift",
            path: "NotificationViewController.swift",
            sourceTree: "\"<group>\""
        };

        // 2. Build Files 생성
        // Info.plist는 Build Settings에서 참조되므로 Build File로 생성하지 않음
        // xcodeProject.hash.project.objects.PBXBuildFile[extensionInfoPlistBuildFileId] = {
        //     isa: "PBXBuildFile",
        //     fileRef: extensionInfoPlistId
        // };

        xcodeProject.hash.project.objects.PBXBuildFile[extensionSwiftBuildFileId] = {
            isa: "PBXBuildFile",
            fileRef: extensionSwiftFileId
        };

        // 3. Build Phases 생성
        xcodeProject.hash.project.objects.PBXSourcesBuildPhase[extensionSourcesPhaseId] = {
            isa: "PBXSourcesBuildPhase",
            buildActionMask: 2147483647,
            files: [
                extensionSwiftBuildFileId
            ],
            runOnlyForDeploymentPostprocessing: 0
        };

        xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[extensionFrameworksPhaseId] = {
            isa: "PBXFrameworksBuildPhase",
            buildActionMask: 2147483647,
            files: [],
            runOnlyForDeploymentPostprocessing: 0
        };

        xcodeProject.hash.project.objects.PBXResourcesBuildPhase[extensionResourcesPhaseId] = {
            isa: "PBXResourcesBuildPhase",
            buildActionMask: 2147483647,
            files: [
                // Info.plist는 Build Settings의 INFOPLIST_FILE로 지정되므로 Resources Phase에서 제외
            ],
            runOnlyForDeploymentPostprocessing: 0
        };

        // 4. Build Configurations 생성
        var debugConfigId = xcodeProject.generateUuid();
        var releaseConfigId = xcodeProject.generateUuid();

        xcodeProject.hash.project.objects.XCConfigurationList[extensionBuildConfigId] = {
            isa: "XCConfigurationList",
            buildConfigurations: [
                debugConfigId,
                releaseConfigId
            ],
            defaultConfigurationIsVisible: 0,
            defaultConfigurationName: "Release"
        };

        var commonBuildSettings = {
            "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
            "CODE_SIGN_ENTITLEMENTS": "\"" + appName + "/" + extensionName + "/" + extensionName + ".entitlements\"",
            "CODE_SIGN_STYLE": "Automatic",
            "CURRENT_PROJECT_VERSION": "1",
            "DEVELOPMENT_TEAM": "\"\"",
            "GENERATE_INFOPLIST_FILE": "NO",
            "INFOPLIST_FILE": "\"" + appName + "/" + extensionName + "/Info.plist\"",
            "INFOPLIST_KEY_CFBundleDisplayName": "\"" + extensionName + "\"",
            "INFOPLIST_KEY_NSHumanReadableCopyright": "\"\"",
            "LD_RUNPATH_SEARCH_PATHS": "\"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks\"",
            "MARKETING_VERSION": "1.0",
            "PRODUCT_BUNDLE_IDENTIFIER": extensionBundleId,
            "PRODUCT_NAME": "\"$(TARGET_NAME)\"",
            "SKIP_INSTALL": "YES",
            "SWIFT_EMIT_LOC_STRINGS": "YES",
            "TARGETED_DEVICE_FAMILY": "\"1,2\""
        };

        xcodeProject.hash.project.objects.XCBuildConfiguration[debugConfigId] = {
            isa: "XCBuildConfiguration",
            buildSettings: commonBuildSettings,
            name: "Debug"
        };

        xcodeProject.hash.project.objects.XCBuildConfiguration[releaseConfigId] = {
            isa: "XCBuildConfiguration",
            buildSettings: commonBuildSettings,
            name: "Release"
        };

        // 5. Extension Group 생성
        xcodeProject.hash.project.objects.PBXGroup[extensionGroupId] = {
            isa: "PBXGroup",
            children: [
                extensionInfoPlistId,
                extensionSwiftFileId
            ],
            path: extensionName,
            sourceTree: "\"<group>\""
        };

        // 6. Extension Target 생성
        xcodeProject.hash.project.objects.PBXNativeTarget[extensionTargetId] = {
            isa: "PBXNativeTarget",
            buildConfigurationList: extensionBuildConfigId,
            buildPhases: [
                extensionSourcesPhaseId,
                extensionFrameworksPhaseId,
                extensionResourcesPhaseId
            ],
            buildRules: [],
            dependencies: [],
            name: extensionName,
            productName: extensionName,
            productReference: extensionProductId,
            productType: "\"com.apple.product-type.app-extension\""
        };

        // 7. 프로젝트에 추가
        var projectGroup = xcodeProject.findPBXGroupKey({name: appName});
        if (projectGroup) {
            xcodeProject.hash.project.objects.PBXGroup[projectGroup].children.push(extensionGroupId);
        }

        xcodeProject.hash.project.objects.PBXProject[xcodeProject.getFirstProject().uuid].targets.push(extensionTargetId);

        // 7.5. Extension에 Push Notifications capability 추가
        this.addPushNotificationsToExtension(xcodeProject, extensionTargetId, extensionName, appName);

        // 8. 메인 앱에 Embed App Extension 추가
        this.addEmbedAppExtensionToMainApp(xcodeProject, appName, extensionTargetId, extensionProductId, extensionName);

        utilities.log("Notification Content Extension setup completed");
        utilities.log("Extension Target ID: " + extensionTargetId);
        utilities.log("Extension Product ID: " + extensionProductId);
        utilities.log("Extension Bundle ID: " + extensionBundleId);
    },

    createExtensionInfoPlist: function(extensionDir, extensionName, bundleId, extensionType) {
        var infoPlistPath = path.join(extensionDir, "Info.plist");
        var infoPlist = {
            CFBundleDevelopmentRegion: "$(DEVELOPMENT_LANGUAGE)",
            CFBundleDisplayName: extensionName,
            CFBundleExecutable: "$(EXECUTABLE_NAME)",
            CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
            CFBundleInfoDictionaryVersion: "6.0",
            CFBundleName: "$(PRODUCT_NAME)",
            CFBundlePackageType: "$(PRODUCT_BUNDLE_PACKAGE_TYPE)",
            CFBundleShortVersionString: "1.0",
            CFBundleVersion: "1",
            NSExtension: {
                NSExtensionPointIdentifier: extensionType === "NotificationService" ?
                    "com.apple.usernotifications.service" :
                    "com.apple.usernotifications.content"
            }
        };

        // Notification Content Extension의 경우 MainInterface 제거
        if (extensionType === "NotificationContent") {
            infoPlist.NSExtension.NSExtensionMainStoryboard = "MainInterface";
        }

        fs.writeFileSync(infoPlistPath, plist.build(infoPlist));
        utilities.log("Created Info.plist for " + extensionName);

        // Extension entitlements 파일 생성
        this.createExtensionEntitlements(extensionDir, extensionName);
    },

    createExtensionEntitlements: function(extensionDir, extensionName) {
        var entitlementsPath = path.join(extensionDir, extensionName + ".entitlements");

        // Debug/Release 환경에 따라 aps-environment 설정
        // Xcode는 Code Signing Identity에 따라 자동으로 처리함:
        // - Apple Development: development
        // - Apple Distribution: production
        var entitlements = {
            // Push Notifications capability 추가 (Xcode가 자동으로 환경에 맞게 변경)
            "aps-environment": "development"
        };

        fs.writeFileSync(entitlementsPath, plist.build(entitlements));
        utilities.log("Created entitlements file with Push Notifications for " + extensionName);
    },

    copyExtensionSourceFiles: function(context, extensionDir, extensionName) {
        var sourceFile = extensionName === "NotificationService" ?
            "NotificationService.swift" : "NotificationViewController.swift";

        // 플러그인 디렉토리에서 소스 파일 찾기
        var sourcePath = path.join(context.opts.plugin.dir, "src", "ios", sourceFile);
        var targetPath = path.join(extensionDir, sourceFile);

        utilities.log("Looking for source file at: " + sourcePath);

        try {
            if (fs.existsSync(sourcePath)) {
                // 파일이 이미 존재하는 경우 덮어쓰기 (업데이트)
                fs.copyFileSync(sourcePath, targetPath);
                utilities.log("Copied " + sourceFile + " to " + extensionDir);
            } else {
                utilities.warn("Source file not found: " + sourcePath);
                throw new Error("Required source file not found: " + sourceFile);
            }
        } catch (error) {
            utilities.error("Failed to copy extension source file: " + error.message);
            throw error;
        }
    },

    removeExtensionFilesFromMainApp: function(xcodeProject, appName) {
        try {
            utilities.log("Removing extension files from main app target...");

            var extensionFiles = [
                "NotificationService.swift",
                "NotificationViewController.swift"
            ];

            // PBXBuildFile에서 Extension 파일들 제거
            var buildFiles = xcodeProject.hash.project.objects.PBXBuildFile;
            var filesToRemove = [];

            for (var buildFileId in buildFiles) {
                if (buildFileId.indexOf("_comment") === -1) {
                    var buildFile = buildFiles[buildFileId];
                    if (buildFile.fileRef_comment) {
                        for (var i = 0; i < extensionFiles.length; i++) {
                            if (buildFile.fileRef_comment === extensionFiles[i]) {
                                filesToRemove.push(buildFileId);
                                utilities.log("Found extension file in build files: " + extensionFiles[i]);
                                break;
                            }
                        }
                    }
                }
            }

            // PBXBuildFile에서 제거
            filesToRemove.forEach(function(buildFileId) {
                delete buildFiles[buildFileId];
                utilities.log("Removed build file reference: " + buildFileId);
            });

            // PBXFileReference에서 Extension 파일들 제거
            var fileRefs = xcodeProject.hash.project.objects.PBXFileReference;
            var refsToRemove = [];

            for (var fileRefId in fileRefs) {
                if (fileRefId.indexOf("_comment") === -1) {
                    var fileRef = fileRefs[fileRefId];
                    if (fileRef.path) {
                        for (var i = 0; i < extensionFiles.length; i++) {
                            if (fileRef.path === extensionFiles[i]) {
                                refsToRemove.push(fileRefId);
                                utilities.log("Found extension file in file references: " + extensionFiles[i]);
                                break;
                            }
                        }
                    }
                }
            }

            // PBXFileReference에서 제거
            refsToRemove.forEach(function(fileRefId) {
                delete fileRefs[fileRefId];
                utilities.log("Removed file reference: " + fileRefId);
            });

            // 메인 앱 Target의 Build Phases에서 Extension 파일들 제거
            var targets = xcodeProject.hash.project.objects.PBXNativeTarget;
            for (var targetId in targets) {
                if (targetId.indexOf("_comment") === -1) {
                    var target = targets[targetId];
                    if (target.name === appName) { // 메인 앱 Target
                        if (target.buildPhases && Array.isArray(target.buildPhases)) {
                            target.buildPhases.forEach(function(phaseObj) {
                                var phaseId = phaseObj.value || phaseObj;
                                var phase = xcodeProject.hash.project.objects.PBXSourcesBuildPhase[phaseId];
                                if (phase && phase.files && Array.isArray(phase.files)) {
                                    var filesToRemoveFromPhase = [];
                                    phase.files.forEach(function(fileObj) {
                                        var fileId = fileObj.value || fileObj;
                                        if (filesToRemove.indexOf(fileId) !== -1) {
                                            filesToRemoveFromPhase.push(fileId);
                                        }
                                    });
                                    filesToRemoveFromPhase.forEach(function(fileId) {
                                        var index = -1;
                                        for (var i = 0; i < phase.files.length; i++) {
                                            var currentFileId = phase.files[i].value || phase.files[i];
                                            if (currentFileId === fileId) {
                                                index = i;
                                                break;
                                            }
                                        }
                                        if (index > -1) {
                                            phase.files.splice(index, 1);
                                            utilities.log("Removed file from build phase: " + fileId);
                                        }
                                    });
                                }
                            });
                        }
                    }
                }
            }

            utilities.log("Extension files removed from main app target successfully");

        } catch (error) {
            utilities.error("Failed to remove extension files from main app: " + error.message);
            // 에러가 발생해도 계속 진행 (치명적이지 않음)
        }
    },

    /**
     * 기존 Notification Extension들을 제거합니다.
     */
    removeExistingExtensions: function(context, xcodeProjectPath) {
        try {
            var xcodeProject = xcode.project(xcodeProjectPath);
            xcodeProject.parseSync();

            var appName = utilities.getAppName();
            var removedCount = 0;

            utilities.log("Removing existing notification extensions...");

            // Notification Service Extension 제거
            if (this.extensionExists(xcodeProject, "NotificationService")) {
                this.removeExtensionTarget(xcodeProject, "NotificationService");
                var serviceDir = path.join("platforms", "ios", appName, "NotificationService");
                if (fs.existsSync(serviceDir)) {
                    fs.rmSync(serviceDir, { recursive: true, force: true });
                    utilities.log("Removed Notification Service Extension directory");
                }
                removedCount++;
            }

            // Notification Content Extension 제거
            if (this.extensionExists(xcodeProject, "NotificationContent")) {
                this.removeExtensionTarget(xcodeProject, "NotificationContent");
                var contentDir = path.join("platforms", "ios", appName, "NotificationContent");
                if (fs.existsSync(contentDir)) {
                    fs.rmSync(contentDir, { recursive: true, force: true });
                    utilities.log("Removed Notification Content Extension directory");
                }
                removedCount++;
            }

            if (removedCount > 0) {
                // 프로젝트 파일 저장 (문법 수정 적용)
                var projectContent = xcodeProject.writeSync();
                projectContent = this.fixProjectSyntax(projectContent);
                fs.writeFileSync(path.resolve(xcodeProjectPath), projectContent);
                utilities.log("Removed " + removedCount + " extension(s) successfully");
            } else {
                utilities.log("No extensions found to remove");
            }

        } catch (error) {
            utilities.error("Failed to remove existing extensions: " + error.message);
            throw error;
        }
    },

    /**
     * Extension Target을 프로젝트에서 제거합니다.
     */
    removeExtensionTarget: function(xcodeProject, extensionName) {
        try {
            utilities.log("Removing extension target: " + extensionName);

            // Extension Target 찾기 및 제거
            var targets = xcodeProject.hash.project.objects.PBXNativeTarget;
            var targetToRemove = null;

            for (var targetId in targets) {
                if (targetId.indexOf("_comment") === -1) {
                    var target = targets[targetId];
                    if (target.name === extensionName) {
                        targetToRemove = targetId;
                        break;
                    }
                }
            }

            if (targetToRemove) {
                // Target 제거
                delete targets[targetToRemove];
                utilities.log("Removed extension target: " + extensionName);

                // 프로젝트의 targets 배열에서도 제거
                var project = xcodeProject.getFirstProject();
                if (project && project.targets) {
                    project.targets = project.targets.filter(function(target) {
                        return target.comment !== extensionName;
                    });
                }

                // 관련 Build Phases 제거
                var buildPhases = xcodeProject.hash.project.objects.PBXSourcesBuildPhase;
                for (var phaseId in buildPhases) {
                    if (phaseId.indexOf("_comment") === -1) {
                        var phase = buildPhases[phaseId];
                        if (phase && phase.files && phase.files.length === 0) {
                            delete buildPhases[phaseId];
                        }
                    }
                }

                utilities.log("Extension target removal completed: " + extensionName);
            } else {
                utilities.log("Extension target not found: " + extensionName);
            }

        } catch (error) {
            utilities.error("Failed to remove extension target: " + error.message);
            throw error;
        }
    },

    /**
     * Extension에 Push Notifications capability를 추가합니다.
     */
    addPushNotificationsToExtension: function(xcodeProject, extensionTargetId, extensionName, appName) {
        try {
            utilities.log("Adding Push Notifications capability to " + extensionName + " extension...");

            // Extension의 entitlements 파일에 Push Notifications 권한 추가
            var entitlementsPath = path.join("platforms", "ios", appName, extensionName, extensionName + ".entitlements");

            if (fs.existsSync(entitlementsPath)) {
                var entitlements = plist.parse(fs.readFileSync(entitlementsPath, 'utf8'));

                // Push Notifications entitlement 추가
                entitlements["aps-environment"] = "development"; // 또는 "production"

                fs.writeFileSync(entitlementsPath, plist.build(entitlements));
                utilities.log("Added Push Notifications entitlement to " + extensionName);
            } else {
                // entitlements 파일이 없으면 생성
                var entitlements = {
                    "aps-environment": "development"
                };

                fs.writeFileSync(entitlementsPath, plist.build(entitlements));
                utilities.log("Created entitlements file with Push Notifications for " + extensionName);
            }

        } catch (error) {
            utilities.error("Failed to add Push Notifications to extension: " + error.message);
            // 에러가 발생해도 계속 진행 (치명적이지 않음)
        }
    },

    addEmbedAppExtensionToMainApp: function(xcodeProject, appName, extensionTargetId, extensionProductId, extensionName) {
        try {
            utilities.log("Adding Embed App Extension to main app target...");

            // 메인 앱 Target 찾기
            var targets = xcodeProject.hash.project.objects.PBXNativeTarget;
            var mainAppTargetId = null;

            utilities.log("Looking for main app target with name: " + appName);
            utilities.log("Available targets: " + Object.keys(targets || {}).length);

            if (!targets) {
                utilities.error("PBXNativeTarget object not found in project");
                return;
            }

            for (var targetId in targets) {
                if (targetId.indexOf("_comment") === -1) {
                    var target = targets[targetId];
                    utilities.log("Found target: " + (target.name || "undefined") + " (ID: " + targetId + ")");
                    if (target && target.name === appName) {
                        mainAppTargetId = targetId;
                        utilities.log("Main app target found by exact name match: " + targetId);
                        break;
                    }
                }
            }

            // 정확한 이름 매치가 안된 경우, 가장 큰 target을 찾기 (메인 앱일 가능성 높음)
            if (!mainAppTargetId) {
                utilities.log("Exact name match failed, looking for main app target by heuristics...");
                var potentialTargets = [];

                for (var targetId in targets) {
                    if (targetId.indexOf("_comment") === -1) {
                        var target = targets[targetId];
                        if (target && target.productType === "\"com.apple.product-type.application\"") {
                            potentialTargets.push({id: targetId, target: target});
                            utilities.log("Found app-type target: " + target.name + " (ID: " + targetId + ")");
                        }
                    }
                }

                if (potentialTargets.length === 1) {
                    mainAppTargetId = potentialTargets[0].id;
                    utilities.log("Found main app target by product type: " + potentialTargets[0].target.name);
                } else if (potentialTargets.length > 1) {
                    // 여러 앱 타겟이 있는 경우, 이름에 Extension이 포함되지 않은 것을 선택
                    for (var i = 0; i < potentialTargets.length; i++) {
                        var targetName = potentialTargets[i].target.name || "";
                        if (targetName.indexOf("Extension") === -1 && targetName.indexOf("Service") === -1) {
                            mainAppTargetId = potentialTargets[i].id;
                            utilities.log("Selected main app target (non-extension): " + targetName);
                            break;
                        }
                    }
                }
            }

            if (!mainAppTargetId) {
                utilities.error("Main app target not found for embedding extension. App name: " + appName);
                utilities.log("Available target names: " + Object.keys(targets).map(function(id) {
                    return targets[id].name || "undefined";
                }).join(", "));
                return;
            }

            var mainAppTarget = xcodeProject.hash.project.objects.PBXNativeTarget[mainAppTargetId];

            if (!mainAppTarget) {
                utilities.error("Main app target object is null or undefined");
                return;
            }

            utilities.log("Main app target found. Has buildPhases: " + (mainAppTarget.buildPhases ? "yes" : "no"));

            // buildPhases 초기화 (없는 경우)
            if (!mainAppTarget.buildPhases) {
                utilities.log("Initializing buildPhases array for main app target");
                mainAppTarget.buildPhases = [];
            }

            // Embed App Extensions Build Phase 찾기 또는 생성
            var embedPhaseId = null;
            if (mainAppTarget.buildPhases && Array.isArray(mainAppTarget.buildPhases)) {
                for (var i = 0; i < mainAppTarget.buildPhases.length; i++) {
                    var phaseObj = mainAppTarget.buildPhases[i];
                    var phaseId = phaseObj.value || phaseObj; // 객체 형태 또는 직접 ID 처리
                    var phase = xcodeProject.hash.project.objects.PBXCopyFilesBuildPhase[phaseId];
                    if (phase && (phase.name === "\"Embed App Extensions\"" || phase.name === "Embed App Extensions")) {
                        embedPhaseId = phaseId;
                        break;
                    }
                }
            }

            if (!embedPhaseId) {
                // Embed App Extensions Build Phase 생성
                embedPhaseId = xcodeProject.generateUuid();

                // PBXCopyFilesBuildPhase 객체 초기화
                if (!xcodeProject.hash.project.objects.PBXCopyFilesBuildPhase) {
                    xcodeProject.hash.project.objects.PBXCopyFilesBuildPhase = {};
                }

                xcodeProject.hash.project.objects.PBXCopyFilesBuildPhase[embedPhaseId] = {
                    isa: "PBXCopyFilesBuildPhase",
                    buildActionMask: 2147483647,
                    dstPath: "\"\"",
                    dstSubfolderSpec: 13,
                    files: [],
                    name: "\"Embed App Extensions\"",
                    runOnlyForDeploymentPostprocessing: 0
                };

                // 메인 앱 Target에 Embed Phase 추가
                if (!mainAppTarget.buildPhases) {
                    mainAppTarget.buildPhases = [];
                }
                mainAppTarget.buildPhases.push(embedPhaseId);
            }

            // Extension을 Embed Phase에 추가
            var embedPhase = xcodeProject.hash.project.objects.PBXCopyFilesBuildPhase[embedPhaseId];
            var embedFileId = xcodeProject.generateUuid();

            // PBXBuildFile 추가
            xcodeProject.hash.project.objects.PBXBuildFile[embedFileId] = {
                isa: "PBXBuildFile",
                fileRef: extensionProductId,
                settings: {
                    ATTRIBUTES: [
                        "RemoveHeadersOnCopy"
                    ]
                }
            };

            // Embed Phase에 파일 추가
            if (!embedPhase.files) {
                embedPhase.files = [];
            }
            embedPhase.files.push(embedFileId);

            // Extension Target Dependency 추가
            var dependencyId = xcodeProject.generateUuid();
            var targetDependencyId = xcodeProject.generateUuid();

            if (!xcodeProject.hash.project.objects.PBXTargetDependency) {
                xcodeProject.hash.project.objects.PBXTargetDependency = {};
            }

            if (!xcodeProject.hash.project.objects.PBXContainerItemProxy) {
                xcodeProject.hash.project.objects.PBXContainerItemProxy = {};
            }

            xcodeProject.hash.project.objects.PBXContainerItemProxy[dependencyId] = {
                isa: "PBXContainerItemProxy",
                containerPortal: xcodeProject.getFirstProject().uuid,
                proxyType: 1,
                remoteGlobalIDString: extensionTargetId,
                remoteInfo: "\"" + extensionName + "\""
            };

            xcodeProject.hash.project.objects.PBXTargetDependency[targetDependencyId] = {
                isa: "PBXTargetDependency",
                target: extensionTargetId,
                targetProxy: dependencyId
            };

            if (!mainAppTarget.dependencies) {
                mainAppTarget.dependencies = [];
            }
            mainAppTarget.dependencies.push(targetDependencyId);

            utilities.log("Embed App Extension added to main app target successfully");

        } catch (error) {
            utilities.error("Failed to add Embed App Extension to main app: " + error.message);
            throw error;
        }
    },

            /**
     * 프로젝트 파일의 문법 에러를 수정합니다.
     */
    fixProjectSyntax: function(projectContent) {
        utilities.log("Fixing project file syntax...");

        var originalLength = projectContent.length;

        // 1. 배열 내 ID 참조 수정 (가장 중요한 수정)
        // buildPhases, files, children 등의 배열에서 ID만 나열되어야 함
        projectContent = projectContent.replace(
            /(buildPhases|files|children|buildConfigurations|targets)\s*=\s*\(\s*([\s\S]*?)\s*\);/g,
            function(match, arrayName, content) {
                // 배열 내용을 개별 항목으로 분리
                var items = [];
                var cleanContent = content.replace(/,\s*$/, ''); // 마지막 쉼표 제거

                // UUID 패턴과 comment 패턴을 찾아서 정리
                var lines = cleanContent.split(/,?\s*\n\s*/);

                lines.forEach(function(line) {
                    line = line.trim();
                    if (line) {
                        // UUID만 추출 (comment 부분 제거)
                        var uuidMatch = line.match(/^[A-Z0-9]{24}/);
                        if (uuidMatch) {
                            items.push(uuidMatch[0]);
                        }
                    }
                });

                if (items.length > 0) {
                    return arrayName + ' = (\n\t\t\t\t' + items.join(',\n\t\t\t\t') + ',\n\t\t\t);';
                } else {
                    return arrayName + ' = ();';
                }
            }
        );

        // 2. ATTRIBUTES 배열 수정
        projectContent = projectContent.replace(
            /ATTRIBUTES\s*=\s*\(\s*([\s\S]*?)\s*\);/g,
            function(match, content) {
                var items = [];
                var lines = content.split(/,?\s*\n\s*/);

                lines.forEach(function(line) {
                    line = line.trim();
                    if (line && line !== ',') {
                        // 마지막 쉼표 제거
                        line = line.replace(/,$/, '');
                        if (line) {
                            items.push(line);
                        }
                    }
                });

                if (items.length > 0) {
                    return 'ATTRIBUTES = (\n\t\t\t\t' + items.join(',\n\t\t\t\t') + ',\n\t\t\t);';
                } else {
                    return 'ATTRIBUTES = ();';
                }
            }
        );

        // 3. 빈 값들 처리
        projectContent = projectContent.replace(/(\w+)\s*=\s*;/g, '$1 = "";');

        // 4. explicitFileType = undefined 제거
        projectContent = projectContent.replace(/\s*explicitFileType\s*=\s*undefined;/g, '');

        // 5. 연속된 쉼표나 세미콜론 정리
        projectContent = projectContent.replace(/,+/g, ',');
        projectContent = projectContent.replace(/;+/g, ';');

        // 6. 마지막 쉼표 처리 (배열 끝)
        projectContent = projectContent.replace(/,(\s*\);)/g, '$1');

        // 7. productType 따옴표 추가
        projectContent = projectContent.replace(
            /productType\s*=\s*com\.apple\.product-type\.app-extension;/g,
            'productType = "com.apple.product-type.app-extension";'
        );

        // 8. TARGETED_DEVICE_FAMILY 따옴표 추가
        projectContent = projectContent.replace(
            /TARGETED_DEVICE_FAMILY\s*=\s*(\d+,\d+);/g,
            'TARGETED_DEVICE_FAMILY = "$1";'
        );

        // 9. name 속성 따옴표 추가 (Extension 이름들)
        projectContent = projectContent.replace(
            /name\s*=\s*(NotificationService|NotificationContent|Embed App Extensions);/g,
            'name = "$1";'
        );

        // 10. sourceTree 따옴표 추가
        projectContent = projectContent.replace(
            /sourceTree\s*=\s*<group>\s*;/g,
            'sourceTree = "<group>";'
        );

        // 11. sourceTree BUILT_PRODUCTS_DIR 따옴표 추가
        projectContent = projectContent.replace(
            /sourceTree\s*=\s*BUILT_PRODUCTS_DIR\s*;/g,
            'sourceTree = "BUILT_PRODUCTS_DIR";'
        );

        var fixedLength = projectContent.length;
        if (originalLength !== fixedLength) {
            utilities.log("Project file syntax fixed: " + Math.abs(originalLength - fixedLength) + " characters changed");
        }

        return projectContent;
    }
};
