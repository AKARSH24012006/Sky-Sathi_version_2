/** Deep links: skysathi://flight/6E2134 opens flight mode;
 *  https://share.skysathi.app/f/<token> opens the family live view. */
export const linking = {
  prefixes: ["skysathi://", "https://share.skysathi.app"],
  config: { screens: { Tabs: { screens: { Flight: "flight/:flightNo" } }, Chat: "chat" } },
};
