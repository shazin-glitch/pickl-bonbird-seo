<?php
// City Walk (post 2071): approved copy v3 (18 Nov 2026) + country timezones. Prints a JSON backup first.
$id = 2071;
if (get_post_type($id) !== 'location' || stripos(get_the_title($id), 'City Walk') === false) { echo "WRONG POST\n"; return; }
$keys = ['hero_heading','hero_description','hero_eyebrow','address','venue_order_url','venue_sections','getting_here_heading','getting_here_body','venue_faqs','rank_math_title','rank_math_description','rank_math_focus_keyword'];
$bk = [];
foreach ($keys as $k) { $bk[$k] = strpos($k, 'rank_math') === 0 ? get_post_meta($id, $k, true) : get_field($k, $id, false); }
$tzbk = [];
foreach (get_terms(['taxonomy' => 'country', 'hide_empty' => false]) as $t) { $tzbk[$t->slug] = get_term_meta($t->term_id, 'timezone', true); }
echo "BACKUP_JSON " . wp_json_encode(['post' => $bk, 'country_tz' => $tzbk]) . "\n";

update_field('hero_heading', 'Pickl City Walk', $id);
update_field('hero_description', "Among City Walk restaurants, nobody stays open longer. Pickl City Walk runs 24 hours, every day: breakfast burger, post-shopping sando, or a 4am cheeseburger you'll tell nobody about.", $id);
update_field('address', 'Building 9, The Boulevard, City Walk', $id);

update_field('field_pickl_venue_sections', [
  ['heading' => 'Five cheeseburgers, zero filler.', 'image' => 2274, 'body' =>
    "The Original keeps it classic: double patty, cheese, dill pickles, white onion, mustard, ketchup. The New Yorker brings tomato, lettuce and secret sauce. The Jeff turns the heat up with feel the heat spice, fried onions and ranch. The BBQ Bacon Burger stacks bacon, fried onions, BBQ and ranch. The Buffalo goes buffalo sauce, ranch and parmesan. Grain-fed chuck, smashed, potato bun, every single time. Can't pick? Build Your Own, single or double.\n\nNot a cheeseburger day? The Legendary Patty Melt is the beef one, The Legendary Chicken Melt the chicken one. We named them, so we're allowed."],
  ['heading' => 'Chicken, fried when you order.', 'image' => 4457, 'body' =>
    "Fresh chicken breast, breaded by hand and fried the moment you order it, on a potato bun with dill pickles, lettuce and comeback sauce. Pick your heat: plain, medium-ish, feel the heat or Nashville. Brave enough for the reaper? Dine in, and sign the waiver first."],
  ['heading' => 'Plant-based at Pickl City Walk? Plenty.', 'image' => 5778, 'body' =>
    "The Original, The New Yorker, The Jeff and The Buffalo all come in a plant-based version too, suitable for vegetarians. Build Your Own does too, with Plant-Based Fries on the side.\n\nThe Rocket Parma Salad is the green thing on the menu that isn't a pickle. Adding fries to it is allowed."],
  ['heading' => 'Homegrown, and still done the hard way.', 'image' => 3542, 'body' =>
    "Pickl started in Dubai and still runs from here. Sauces, spice blends and pickles are made fresh every day, and the beef and chicken come with no hormones, no preservatives and no additives."],
], $id);
update_field('field_pickl_venue_here_h', 'Park at The Boulevard and walk in.', $id);
update_field('field_pickl_venue_here_b', "Pickl is in The Boulevard zone of City Walk, and The Boulevard is the closest car park for this end of the City Walk restaurants. The nearest metro, Burj Khalifa/Dubai Mall, is a short drive away.", $id);
update_field('venue_faqs', [
  ['question' => 'What are Plant-Based Fries?', 'answer' => 'Fries topped with a plant-based patty, dill pickles, lettuce, secret sauce and parsley. Vegetarian, not boring.'],
  ['question' => 'Can I get the reaper delivered?', 'answer' => "No. It's dine-in only, waiver and all."],
  ['question' => 'Can I order Pickl City Walk for delivery?', 'answer' => 'You can, through Talabat, Careem, Noon Food, Deliveroo or Keeta. Any hour you like.'],
], $id);
update_post_meta($id, 'rank_math_title', 'Pickl City Walk | 24/7 Burger Restaurant, City Walk Dubai');
update_post_meta($id, 'rank_math_description', "Time Out Dubai's Best Burger, 2022 and 2023. Building 9, City Walk, open 24 hours: smashed cheeseburgers, chicken sandos and shakes.");
update_post_meta($id, 'rank_math_focus_keyword', 'city walk restaurants,city walk dubai restaurants,pickl city walk');

$tz = ['ae' => 'Asia/Dubai', 'sa' => 'Asia/Riyadh', 'qa' => 'Asia/Qatar', 'bh' => 'Asia/Bahrain', 'om' => 'Asia/Muscat', 'jo' => 'Asia/Amman', 'eg' => 'Africa/Cairo', 'kw' => 'Asia/Kuwait', 'iq' => 'Asia/Baghdad'];
foreach ($tz as $slug => $zone) { $t = get_term_by('slug', $slug, 'country'); if ($t) update_field('field_pickl_country_tz', $zone, 'country_' . $t->term_id); }

wp_cache_flush();
$s = get_field('venue_sections', $id);
echo "sections=" . count($s ?: []) . " img1=" . ($s[0]['image'] ?? '') . " faqs=" . count(get_field('venue_faqs', $id) ?: []) . " h1=" . get_field('hero_heading', $id) . " addr=" . get_field('address', $id) . " tz_ae=" . get_term_meta(get_term_by('slug', 'ae', 'country')->term_id, 'timezone', true) . "\n";
