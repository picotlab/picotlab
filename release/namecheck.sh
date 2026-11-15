#!/bin/sh
# Name availability check (read-only lookups). Usage: release/namecheck.sh name1 name2 ...
# Domains via RDAP (404 = unregistered), GitHub user/org, npm unscoped + @scope. Prints one TSV row per name.
# Free here means "not registered/taken right now", not "safe": a trademark search is a separate step.
TLDS="${TLDS:-com org app io dev}"
printf "name"; for t in $TLDS; do printf "\t.%s" "$t"; done; printf "\tgithub\tnpm\n"
for n in "$@"; do
  printf "%s" "$n"
  for t in $TLDS; do
    if [ "$t" = io ]; then  # rdap.org has no .io data (returns 404 for google.io): use whois
      w=$(whois "$n.io" 2>/dev/null)
      if echo "$w" | grep -qi "Domain not found"; then s=FREE; elif echo "$w" | grep -qi "Creation Date"; then s=taken; else s="?"; fi
    else
      c=$(curl -s -o /dev/null -w "%{http_code}" -m 10 -L "https://rdap.org/domain/$n.$t")
      case $c in 404) s=FREE;; 200) s=taken;; *) s="?$c";; esac
    fi; printf "\t%s" "$s"
  done
  g=$(gh api "users/$n" --jq .type 2>/dev/null) && printf "\t%s" "$g" || printf "\tFREE"
  if npm view "$n" name >/dev/null 2>&1; then printf "\ttaken"; else printf "\tFREE"; fi
  printf "\n"
done
