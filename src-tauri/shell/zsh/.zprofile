_phosphor_zdotdir="$ZDOTDIR"
if [[ -n "$PHOSPHOR_ORIG_ZDOTDIR" ]]; then ZDOTDIR="$PHOSPHOR_ORIG_ZDOTDIR"; else unset ZDOTDIR; fi
[[ -f "${ZDOTDIR:-$HOME}/.zprofile" ]] && source "${ZDOTDIR:-$HOME}/.zprofile"
ZDOTDIR="$_phosphor_zdotdir"
unset _phosphor_zdotdir
