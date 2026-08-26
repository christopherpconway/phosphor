/** macOS WebKit autocorrects and capitalizes free text inputs; on a
 *  preset/config name that turns "qa-test" into "Qa-test" and a suggestion
 *  bubble eats the Enter that was meant to commit. These inputs take names
 *  and search terms, never prose. */
export function plainTextInput(input: HTMLInputElement): void {
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
}
