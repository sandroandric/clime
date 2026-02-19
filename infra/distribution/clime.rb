class Clime < Formula
  desc "CLI-first registry for discovering and running other CLIs"
  homepage "https://github.com/clime-registry/clime"
  head "https://github.com/clime-registry/clime.git", branch: "main"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
  end

  test do
    assert_match "clime", shell_output("#{bin}/clime --version")
  end

  def caveats
    <<~EOS
      Default API endpoint:
        https://api.clime.sh

      Configure a key for production:
        clime configure --api-key <key> --base-url https://api.clime.sh
    EOS
  end
end
