function normalizedCommandList(commands: string[]) {
  return [...new Set(commands.map((command) => command.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function bashCompletion(commands: string[]) {
  const commandList = normalizedCommandList(commands);
  return `# clime bash completion
_clime_complete() {
  local cur prev words cword
  _init_completion || return
  local commands="${commandList.join(" ")}"

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
    return
  fi

  case "$prev" in
    --type)
      COMPREPLY=( $(compgen -W "used rising compat requested" -- "$cur") )
      return
      ;;
    --workflow)
      COMPREPLY=()
      return
      ;;
  esac
}
complete -F _clime_complete clime
`;
}

function zshCompletion(commands: string[]) {
  const commandList = normalizedCommandList(commands);
  return `#compdef clime
_clime() {
  local -a commands
  commands=(${commandList.map((command) => `"${command}"`).join(" ")})
  _arguments "1:command:(${commandList.join(" ")})" "*::arg:->args"

  case $state in
    args)
      case $words[2] in
        rankings)
          _arguments "--type[ranking type]:type:(used rising compat requested)"
          ;;
      esac
      ;;
  esac
}
_clime "$@"
`;
}

function fishCompletion(commands: string[]) {
  const commandList = normalizedCommandList(commands);
  return commandList.map(
    (command) => `complete -c clime -f -n "__fish_use_subcommand" -a "${command}"`
  )
    .concat([
      "complete -c clime -n '__fish_seen_subcommand_from rankings' -l type -a 'used rising compat requested'"
    ])
    .join("\n");
}

export function completionScript(shell: "bash" | "zsh" | "fish", commands: string[]) {
  if (shell === "bash") {
    return bashCompletion(commands);
  }
  if (shell === "zsh") {
    return zshCompletion(commands);
  }
  return fishCompletion(commands);
}
