// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "todo-swift",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.99.0"),
    ],
    targets: [
        .executableTarget(
            name: "todo-swift",
            dependencies: [.product(name: "Vapor", package: "vapor")],
            path: ".",
            sources: ["main.swift"]
        ),
    ]
)
