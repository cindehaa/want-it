{
  description = "Pooled procurement marketplace demo (bun + react + shadcn)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.nodejs_22
          ];
          shellHook = ''
            echo "bun $(bun --version) / node $(node --version)"
          '';
        };

        apps.default = {
          type = "app";
          program = toString (pkgs.writeShellScript "dev" ''
            export PATH=${pkgs.bun}/bin:${pkgs.nodejs_22}/bin:$PATH
            ${pkgs.bun}/bin/bun install
            exec ${pkgs.bun}/bin/bun run dev
          '');
        };
      });
}
