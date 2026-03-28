defmodule Todo.MixProject do
  use Mix.Project

  def project do
    [
      app: :todo,
      version: "1.0.0",
      elixir: "~> 1.16",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [mod: {Todo.Application, []}, extra_applications: [:logger, :inets, :ssl]]
  end

  defp deps do
    [
      {:phoenix,       "~> 1.7"},
      {:plug_cowboy,   "~> 2.7"},
      {:jason,         "~> 1.4"},
      {:cors_plug,     "~> 3.0"}
    ]
  end
end
