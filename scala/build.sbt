name := "todo-scala"
version := "1.0.0"
scalaVersion := "3.4.2"

lazy val root = (project in file("."))
  .enablePlugins(PlayScala)
  .settings(
    libraryDependencies ++= Seq(
      ws,
      guice
    ),
    PlayKeys.playDefaultPort := 8080
  )
