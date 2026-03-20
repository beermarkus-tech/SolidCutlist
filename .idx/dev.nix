# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.05"; # or "unstable"
  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.python311
    # pkgs.go
    # pkgs.python311
    # pkgs.python311Packages.pip
    # pkgs.nodejs_20
    # pkgs.nodePackages.nodemon
  ];
  # Sets environment variables in the workspace
  env = {};
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      # "vscodevim.vim"
      "google.gemini-cli-vscode-ide-companion"
      "zhuangtongfa.material-theme"
    ];
    # Enable previews
    previews = {
      enable = false;
      previews = {
        web = {
          # Use sh -c to ensure the PORT variable is evaluated by the shell
          command = [ "sh" "-c" "python3 -m http.server $PORT --bind 0.0.0.0" ];
          manager = "web";
          env = { PORT = "$PORT"; };
        };
      };
    };
    # Workspace lifecycle hooks
    workspace = {
      # This opens the file in your editor immediately on creation
      onCreate = {
        default.openFiles = [ "view_setup.html" "css_global.html" ];
      };
      # This runs every time the workspace starts
      onStart = {
        # Optional: You can add a command here to log that the server is starting
        server-ready = "echo 'Server starting on port $PORT...'";
      };
    };
  };
}
