// Scala Play Framework — Deploy to Heroku / Render
// Build: sbt dist
// Run:   ./target/universal/todo-scala-1.0.0/bin/todo-scala

import play.api.mvc._
import play.api.libs.ws._
import play.api.libs.json._
import play.api.routing.Router
import play.api.routing.sird._
import play.api.{Application, ApplicationLoader, BuiltInComponents, BuiltInComponentsFromContext}
import play.api.libs.ws.ahc.AhcWSComponents
import play.core.server.{NettyServer, ServerConfig}
import scala.concurrent.{ExecutionContext, Future}
import java.net.InetSocketAddress

class TodoComponents(context: ApplicationLoader.Context)
    extends BuiltInComponentsFromContext(context)
    with AhcWSComponents
    with NoHttpFiltersComponents {

  implicit val ec: ExecutionContext = executionContext

  val supabaseUrl = sys.env.getOrElse("SUPABASE_URL", "")
  val supabaseKey = sys.env.getOrElse("SUPABASE_SERVICE_ROLE_KEY", "")

  def sbRequest(path: String): WSRequest =
    wsClient
      .url(s"$supabaseUrl/rest/v1$path")
      .withHttpHeaders(
        "apikey"        -> supabaseKey,
        "Authorization" -> s"Bearer $supabaseKey",
        "Content-Type"  -> "application/json"
      )

  val corsHeaders = Seq(
    "Access-Control-Allow-Origin"  -> "*",
    "Access-Control-Allow-Methods" -> "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers" -> "Content-Type"
  )

  def withCors(result: Result): Result = result.withHeaders(corsHeaders: _*)

  override def router: Router = Router.from {
    case OPTIONS(_) =>
      Action { Ok("").withHeaders(corsHeaders: _*) }

    case GET(p"/api/scala/todos") =>
      Action.async {
        sbRequest("/todos?select=*&order=created_at.desc").get().map { r =>
          withCors(Ok(Json.obj("todos" -> r.json)))
        }
      }

    case POST(p"/api/scala/todos") =>
      Action.async(parse.json) { req =>
        val title = (req.body \ "title").asOpt[String].map(_.trim).getOrElse("")
        if (title.isEmpty) {
          Future.successful(withCors(BadRequest(Json.obj("error" -> "title is required"))))
        } else {
          sbRequest("/todos")
            .withHttpHeaders("Prefer" -> "return=representation")
            .post(Json.obj("title" -> title, "completed" -> false))
            .map { r =>
              withCors(Created(Json.obj("todo" -> (r.json \ 0).get)))
            }
        }
      }

    case PATCH(p"/api/scala/todos/$id") =>
      Action.async(parse.json) { req =>
        val update = Json.obj(
          Seq(
            (req.body \ "title").asOpt[String].map("title" -> Json.toJsFieldJsValueWrapper(_)),
            (req.body \ "completed").asOpt[Boolean].map("completed" -> Json.toJsFieldJsValueWrapper(_))
          ).flatten: _*
        )
        sbRequest(s"/todos?id=eq.$id")
          .withHttpHeaders("Prefer" -> "return=representation")
          .patch(update)
          .map { r =>
            val arr = r.json.as[JsArray]
            if (arr.value.isEmpty) withCors(NotFound(Json.obj("error" -> "todo not found")))
            else withCors(Ok(Json.obj("todo" -> arr(0))))
          }
      }

    case DELETE(p"/api/scala/todos/$id") =>
      Action.async {
        sbRequest(s"/todos?id=eq.$id&select=id").get().flatMap { check =>
          if (check.json.as[JsArray].value.isEmpty) {
            Future.successful(withCors(NotFound(Json.obj("error" -> "todo not found"))))
          } else {
            sbRequest(s"/todos?id=eq.$id").delete().map { _ =>
              withCors(Ok(Json.obj("message" -> "deleted")))
            }
          }
        }
      }
  }
}

class TodoLoader extends ApplicationLoader {
  def load(context: ApplicationLoader.Context): Application =
    new TodoComponents(context).application
}

object Main extends App {
  val port   = sys.env.getOrElse("PORT", "8080").toInt
  val config = ServerConfig(address = new InetSocketAddress("0.0.0.0", port))
  NettyServer.fromApplication(
    ApplicationLoader.apply(
      ApplicationLoader.createContext(play.api.Environment.simple())
    )
  )
}
