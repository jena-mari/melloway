// Discovery leads, not venue facts: addresses/hours/prices still require verification.
// Summaries are short paraphrases of the user-selected sources, checked 2026-10-11.
export const recommendationSourceUrls = [
  'https://www.russh.com/best-cafes-sydney/',
  'https://www.reddit.com/r/foodies_sydney/comments/1pul1h9/sydney_cafes/',
  'https://www.2cameras1bucketlist.com/top-things-sydney/',
  'https://www.reddit.com/r/sydney/comments/1c5fb88/what_are_your_top_underatedlesser_known_things_to/',
];
const lead = (name, locality, tag, source, summary, aliases = []) => ({
  name, locality, tags: [tag], aliases,
  evidence: [{ url: recommendationSourceUrls[source], summary, sentiment: 'positive', origin: 'independent', checkedAt: '2026-10-11', historical: source >= 2 }],
});
export const recommendationLeads = [
  lead('Reuben Hills', 'Surry Hills', 'Coffee shops', 0, 'Editorial café selection.'),
  lead('Reuben Hills', 'Surry Hills', 'Coffee shops', 1, 'Recommended in a Sydney café discussion.'),
  lead('Single O', 'Surry Hills', 'Coffee shops', 1, 'Community coffee recommendation.', ['Single O Surry Hills']),
  lead('Paramount Coffee Project', 'Surry Hills', 'Coffee shops', 1, 'Community café recommendation.'),
  lead('Artificer Coffee', 'Surry Hills', 'Coffee shops', 1, 'Community coffee recommendation.'),
  lead('Outta Coffee', 'Haymarket', 'Matcha cafés', 1, 'Coffee and matcha recommendation.'),
  lead('Parami', 'Sydney', 'Matcha cafés', 1, 'Japanese café suggested for matcha and snacks.'),
  lead('Edition Roasters', 'Sydney', 'Coffee shops', 1, 'Suggested MidCity café.', ['Edition Coffee Roasters']),
  lead('Soulmate Coffee', 'Newtown', 'Coffee shops', 0, 'Editorial brunch selection.', ['Soulmate']),
  lead('Rolling Penny', 'Newtown', 'Brunch', 0, 'Editorial brunch selection.'),
  lead('Soul Deli', 'Surry Hills', 'Asian food', 0, 'Korean-inspired brunch selection.', ['SoulDeli']),
  lead('Valentina’s', 'Marrickville', 'Brunch', 0, 'Diner-style café selection.', ["Valentina's"]),
  lead('Hearthe', 'Stanmore', 'Desserts', 0, 'Cake and pastry selection.'),
  lead('PINA', 'Potts Point', 'Matcha cafés', 0, 'Café selection mentioning matcha.'),
  lead('The Rocks Markets', 'The Rocks', 'Flea markets', 2, 'Market browsing suggestion.'),
  lead('Opera Bar', 'Sydney', 'Cocktail bars', 2, 'Harbour-side food and drink suggestion.'),
  lead('Art Gallery of New South Wales', 'Sydney', 'Art galleries', 2, 'Art collection suggestion.', ['Art Gallery of NSW']),
  lead('Art Gallery of New South Wales', 'Sydney', 'Art galleries', 3, 'Community gallery recommendation.', ['Art Gallery of NSW']),
  lead('White Rabbit Gallery', 'Chippendale', 'Art galleries', 3, 'Community contemporary-art recommendation.'),
  lead('Wendy Whiteley’s Secret Garden', 'Lavender Bay', 'Scenic walks', 3, 'Community garden suggestion.', ["Wendy Whiteley's Secret Garden"]),
  lead('Chau Chak Wing Museum', 'Camperdown', 'Art galleries', 3, 'Community museum recommendation.'),
];
