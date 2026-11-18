<?php
// City hubs v3 fill (17 Nov 2026): story-flow bands for Dubai (106), Abu Dhabi (108), Sharjah (107)
// + map pins for the 14 UAE venues. Prints a JSON backup of the previous values first.
$cities = [106, 108, 107];
$names  = ['city_h1','city_intro','city_hero_image','city_order_url','city_map_heading','city_map_body','city_sections','city_faqs'];
$backup = [];
foreach ($cities as $tid) {
    foreach ($names as $n) { $backup['city_' . $tid][$n] = get_field($n, 'city_' . $tid, false); }
}
$venue_ids = [420,3567,2071,3570,3637,422,424,3569,3568,1382,3638,3639,3552,2072];
foreach ($venue_ids as $v) { $backup['venue_' . $v] = ['map_lat' => get_post_meta($v, 'map_lat', true), 'map_lng' => get_post_meta($v, 'map_lng', true)]; }
echo "BACKUP_JSON " . wp_json_encode($backup) . "\n";

$thumb = function ($pid) {
    $t = get_post_thumbnail_id($pid);
    if ($t) return (int) $t;
    $g = get_field('gallery', $pid, false);
    if (is_array($g) && $g) { $f = reset($g); return (int) (is_array($f) ? ($f['ID'] ?? $f['id'] ?? 0) : $f); }
    return 0;
};

$deliveroo = 'https://deliveroo.ae/brands/pickl';
$data = [
  106 => [
    'hero' => 2274,
    'intro' => "Born in Dubai. Still obsessed with it. Seven Pickls across the city, from the sand at JBR to City Centre Mirdif, and three of them never close.",
    'map_h' => 'Never far from a Pickl.',
    'map_b' => "JLT, City Walk and Motor City are open 24 hours. JBR runs till 4am, Madinat Badr till 2am at the weekend, and Al Safa is pick-up and delivery only. Sleep is overrated. (It isn't. Get some. After the burger.)",
    'sections' => [
      ['heading' => 'It started in JLT.', 'image' => $thumb(420), 'items' => [],
       'body' => "<p>April 2019. One humble burger joint on the ground floor of One JLT, smashing patties and hoping Dubai would get it.</p>\n<p>Dubai got it. People drove down from Abu Dhabi just to try one. Then they brought their friends, and their friends brought theirs. One became 14 across the UAE, and Pickl now serves burgers in seven countries. Still homegrown, and proud of it. Deliveroo named us Best Homegrown Dubai Restaurant in 2024 and again in 2025, and that one means a lot. You built this. Thank you, Dubai.</p>"],
      ['heading' => 'Best Burger in Dubai. Officially. Twice.', 'image' => 4169, 'items' => [],
       'body' => "<p>Dubai has no shortage of burger places. Time Out Dubai still named Pickl the Best Burger in Dubai in 2022, then did it again in 2023. We'd bring it up less if it wasn't true. <a href=\"/ae/journal/time-out-dubais-best-burger/\">The full story's here.</a></p>\n<h3>Fresh. Fast. Food.</h3>\n<p>Grain-fed beef, smashed on a hot grill. Chicken breast hand-breaded and fried when you order, not a minute before. Sauces, spice blends and pickles made fresh every day, under one roof. No hormones, no preservatives, no additives. What you see is what you get.</p>"],
      ['heading' => 'First time? Start here.', 'image' => 0,
       'items' => [
         ['title' => 'The Original', 'image' => 2848, 'body' => "Double patty, cheese, dill pickles, white onion, mustard, ketchup, potato bun. Nothing to hide behind. Simple. Not basic."],
         ['title' => 'The Chicken Sando', 'image' => 2766, 'body' => "Five heat levels, from plain to the reaper. Medium-ish is a warm hug. The reaper comes with a waiver. We're not joking."],
       ],
       'body' => "<p>Rather design your own? Build Your Own comes single or double, plant-based too. Finish with a shake, made Gooder. <a href=\"/ae/menu/\">Full menu</a></p>"],
    ],
    'faqs' => [
      ['Does Pickl deliver in Dubai?', "Yep. Talabat, Careem, Noon Food, Deliveroo and Keeta. Pick your app, pick your burger."],
      ['What else has Pickl won?', "Highly Commended Burger Bar at the Time Out Restaurant Awards 2025, Deliveroo Restaurant of the Year four years running (2022 to 2025), and Best Fried Chicken in 2022."],
      ['Is there a plant-based burger?', "Yep. The Original, The New Yorker, The Jeff, The Buffalo and Build Your Own all come plant-based."],
      ["What's on The New Yorker?", "Double chuck patty, cheese, tomato, lettuce and secret sauce. Potato bun, naturally."],
      ['Is there a Pickl app?', "There is. Rewards, the menu and a store finder, all in your pocket."],
    ],
  ],
  108 => [
    'hero' => 4454,
    'intro' => "Three Pickls in the capital, three very different backdrops: Soul Beach on Saadiyat, Gardens Plaza in Khalifa City and WTC on the Corniche. Same burger at all three. You just pick the view.",
    'map_h' => 'Best burger in Abu Dhabi? Pick your view.',
    'map_b' => "Mamsha is open till midnight, WTC till 2am on Thursdays and Fridays, and Khalifa City carries on till 4am, every night. Your 2am self will be thrilled. Your 9am self might have notes. Heading inland? <a href=\"/ae/al-ain/al-ain/\">Pickl Al Ain</a> is a drive-thru, open till 2am.",
    'sections' => [
      ['heading' => 'Abu Dhabi used to drive to JLT.', 'image' => $thumb(3569), 'items' => [],
       'body' => "<p>Back in 2019, the nearest Pickl to the capital was on the ground floor of One JLT in Dubai. People made the drive anyway, just to try one. We took the hint. Now there are three Pickls in Abu Dhabi, and the drive is a lot shorter. Still homegrown, just up the coast.</p>"],
      ['heading' => 'Abu Dhabi noticed too.', 'image' => 2757, 'items' => [],
       'body' => "<p>Time Out named Pickl a Highly Commended Burger Bar at its 2025 Restaurant Awards, in Abu Dhabi and in Dubai. That's on top of Time Out Dubai's Best Burger, 2022 and 2023. What came down the coast is the way the food gets made.</p>\n<h3>Simple. Not Basic.</h3>\n<p>Grain-fed beef, smashed and laid on a potato bun. Chicken breast hand-breaded and fried to order. Sauces, spice blends and pickles made fresh every day. No hormones, no preservatives, no additives.</p>"],
      ['heading' => 'New here? Start with The Original.', 'image' => 0,
       'items' => [
         ['title' => 'The Original', 'image' => 2848, 'body' => "Double patty, cheese, dill pickles, white onion, mustard, ketchup, potato bun. Nothing to hide behind."],
         ['title' => 'The Chicken Sando', 'image' => 2766, 'body' => "Five heat levels, from plain to the reaper. Stop when your eyes start watering."],
       ],
       'body' => "<p>Save room for the Famous Ice Cream Sando: your pick of ice cream in a deep-fried cinnamon sugar bun. <a href=\"/ae/menu/\">Full menu</a>. More Pickls up the coast in <a href=\"/ae/dubai/\">Dubai</a> and <a href=\"/ae/sharjah/\">Sharjah</a>.</p>"],
    ],
    'faqs' => [
      ['Does Pickl deliver in Abu Dhabi?', "Yep. Talabat, Careem, Noon Food, Deliveroo and Keeta, from all three city Pickls and from Al Ain."],
      ['Which Abu Dhabi Pickl is easiest to park at?', "Corniche: the WTC Mall car park is ticketless and Salik does the billing. Khalifa City: Gardens Plaza has parking for diners."],
      ['Is there a plant-based burger?', "Yep. The Original, The New Yorker, The Jeff, The Buffalo and Build Your Own all come plant-based."],
      ['Is there a Pickl drive-thru near Abu Dhabi?', "Head inland. Pickl Al Ain opened as a drive-thru at Zakher Drive Thru Park in June 2023."],
    ],
  ],
  107 => [
    'hero' => 4457,
    'intro' => "Two Pickls inside the emirate: one on East Boulevard in Aljada, one on Al Heera Beach. Chasing the best burger in Sharjah no longer comes with a traffic jam.",
    'map_h' => 'Beach or boulevard?',
    'map_b' => "Aljada runs till 4am, every night. Al Heera Beach stays open till 1am, Friday to Sunday.",
    'sections' => [
      ['heading' => 'The E11 was getting a bit much.', 'image' => $thumb(3552), 'items' => [],
       'body' => "<p>For years, a Pickl meant the E11 to Dubai, and plenty of you made that drive for a cheeseburger. We took it as a compliment, and as a hint. Around New Year 2023 the first Sharjah Pickl opened on Al Heera Beach. Aljada makes two. Same homegrown burger, a lot closer to home.</p>"],
      ['heading' => 'Same burger as next door.', 'image' => 2824, 'items' => [],
       'body' => "<p>Time Out Dubai named Pickl Best Burger in Dubai in 2022 and 2023. Sharjah gets the exact same burger.</p>\n<h3>Simple. Not Basic.</h3>\n<p>Grain-fed beef, smashed on a hot grill. Chicken breast breaded by hand and fried when you order. Sauces, spice blends and pickles made fresh every day, on the beach and on the boulevard alike.</p>"],
      ['heading' => 'New here? Order The Jeff.', 'image' => 0,
       'items' => [
         ['title' => 'The Jeff', 'image' => 2854, 'body' => "Double chuck patty, cheese, fried onions and ranch on a potato bun, with feel the heat spice running through it. A cheeseburger with a kick. Enough to notice, not enough to need a glass of milk."],
         ['title' => 'The Chicken Sando', 'image' => 2766, 'body' => "That spice is borrowed from the chicken side of the menu. The Chicken Sando is fresh fried chicken, dill pickles, lettuce and comeback sauce on a potato bun, and you pick the heat: plain, medium-ish, feel the heat, Nashville or the reaper. Liked the Jeff? Feel the heat is the same kick. Feeling brave? Keep climbing."],
       ],
       'body' => "<p>Cool it all down with a salted caramel shake. Little legends get Little Pickl meals. <a href=\"/ae/menu/\">Everything else is on the menu</a>.</p>\n<p>Not in Sharjah tonight? Pickl is in <a href=\"/ae/dubai/\">Dubai</a> and <a href=\"/ae/abu-dhabi/\">Abu Dhabi</a> too, and <a href=\"/ae/ras-al-khaimah/ras-al-khaimah/\">Lagoon Stop in Ras Al Khaimah</a> is a drive-thru.</p>"],
    ],
    'faqs' => [
      ['Can I get Pickl delivered in Sharjah?', "Both Sharjah Pickls are on Talabat, Careem, Noon Food, Deliveroo and Keeta. Still no E11 involved."],
      ['Is there a plant-based burger?', "Yep. The Original, The New Yorker, The Jeff, The Buffalo and Build Your Own all come plant-based."],
      ['Which sauces can I pick?', "Comeback, secret, ranch, BBQ, Caesar, mustard or buffalo. Found the one? Go Big Boy."],
      ['Anything lighter than a burger?', "The Rocket Parma Salad. Rocket, white onion, parmesan, balsamic. Virtuous, briefly."],
    ],
  ],
];

foreach ($data as $tid => $d) {
    $t = 'city_' . $tid;
    update_field('field_pickl_city_hero_image', $d['hero'], $t);
    update_field('field_pickl_city_intro', $d['intro'], $t);
    update_field('field_pickl_city_order_url', $deliveroo, $t);
    update_field('field_pickl_city_map_heading', $d['map_h'], $t);
    update_field('field_pickl_city_map_body', $d['map_b'], $t);
    update_field('field_pickl_city_sections', $d['sections'], $t);
    update_field('field_pickl_city_faqs', array_map(function ($f) { return ['question' => $f[0], 'answer' => $f[1]]; }, $d['faqs']), $t);
    $s = get_field('city_sections', $t);
    echo "$tid sections=" . count($s ?: []) . " items3=" . count($s[2]['items'] ?? []) . " img1=" . ($s[0]['image'] ?? 'none') . " faqs=" . count(get_field('city_faqs', $t) ?: []) . " hero=" . get_field('city_hero_image', $t) . "\n";
}

$pins = [420=>[25.0725399,55.1447035],3567=>[25.0782076,55.1343747],2071=>[25.205179,55.2630904],3570=>[25.0457516,55.239957],3637=>[25.2177579,55.4086697],422=>[25.1588224,55.2252015],424=>[25.2374229,55.4139709],3569=>[24.5390135,54.4084772],3568=>[24.4329863,54.5662353],1382=>[24.4897659,54.355725],3638=>[24.1446788,55.6896892],3639=>[25.31289,55.4740497],3552=>[25.3854133,55.406046],2072=>[25.7138551,55.8323927]];
foreach ($pins as $pid => $ll) {
    update_field('field_pickl_loc_lat', (string) $ll[0], $pid);
    update_field('field_pickl_loc_lng', (string) $ll[1], $pid);
}
echo "pins set: " . count($pins) . " e.g. 420=" . get_post_meta(420, 'map_lat', true) . "," . get_post_meta(420, 'map_lng', true) . "\n";
