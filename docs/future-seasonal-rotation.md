# Future Enhancement: Seasonal Recipe Rotation

## Concept

Tag recipes with seasons and have Claude weight toward in-season ingredients and cooking styles. Lighter meals and grilling in spring/summer, soups and braises in fall/winter.

## Approach

1. **Recipe tags**: Add season tags (`spring`, `summer`, `fall`, `winter`, `year-round`) to recipes. Most recipes would be `year-round` — only tag the ones with strong seasonal affinity.

2. **System prompt**: Instruct Claude to check the current month and favor seasonally appropriate recipes. Not a hard filter — just a weighting preference.

3. **Seasonal ingredient awareness**: Claude already knows what's in season from general knowledge. Prompt it to note seasonal availability in reasoning: "Tomatoes are in peak season right now — great time for this caprese."

4. **Integration with weekly ad**: Seasonal produce tends to go on sale when it's in season. The weekly ad integration would naturally surface these.

## Why deferred

- Low urgency: Claude's general knowledge already handles this reasonably well without explicit tagging
- Recipe library needs to grow before seasonal rotation adds meaningful value
- Tagging 50+ recipes with seasons is a one-time effort that's not worth doing until the rest of the platform is stable
