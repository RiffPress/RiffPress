# Riff for iOS

Reserved for the native app. Nothing is built here yet.

The plan: a Swift package and Xcode project that signs in to a WordPress site running the Riff
plugin, reads its posts and media through the REST API, and plays them with the same queue, Now
Playing and Song/Video behaviour as the web player, plus what only a native app can do: background
audio without a browser, CarPlay, offline downloads, and Apple Watch controls.

Nothing in `plugins/` or `packages/` depends on this folder. When the app exists it will have its
own `Package.swift`, its own tests, and its own entry in the root README; it is not an npm workspace.
