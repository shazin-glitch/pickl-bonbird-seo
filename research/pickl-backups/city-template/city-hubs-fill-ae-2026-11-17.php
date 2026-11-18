<?php
function vlink($city){ $q=get_posts(['post_type'=>'location','post_status'=>'publish','numberposts'=>1,'tax_query'=>[['taxonomy'=>'city','field'=>'slug','terms'=>$city]]]); return $q? wp_make_link_relative(get_permalink($q[0]->ID)) : ''; }
$alain=vlink('al-ain'); $rak=vlink('ras-al-khaimah');
if(!$alain||!$rak){echo "LINK MISSING $alain $rak\n";exit(1);}
$j='/ae/journal/time-out-dubais-best-burger/';
$C=[
'dubai'=>[
 'title'=>'Best Burger in Dubai? 7 Pickls, 3 Open 24 Hours',
 'desc'=>"Time Out Dubai's Best Burger in 2022 and 2023. Seven Pickls across Dubai, three open 24 hours, from JBR to Mirdif. Find yours.",
 'fk'=>'best burger in dubai,burger dubai,burger restaurants in dubai,burger places in dubai,burgers in dubai,pickl dubai',
 'ogt'=>'Pickl Dubai','ogd'=>'Seven Pickls across Dubai, three of them open 24 hours. Smashed cheeseburgers, chicken sandos and hot dogs from JBR to Mirdif. Find yours.',
 'intro'=>"Born in Dubai. Still obsessed with it. Looking for the best burger in Dubai? There are seven Pickls across the city, from the sand at JBR to Mirdif City Centre, and three of them never close.",
 'sections'=>[
  ['Up late? Same.','<p>JLT, City Walk and Motor City never close. JBR runs till 4am, and Madinat Badr till 2am at the weekend. Sleep is overrated. (It isn\'t. Get some. After the burger.)</p>'],
  ['Best Burger in Dubai. Officially. Twice.','<p>Time Out Dubai gave us Best Burger in Dubai in 2022. Then they did it again in 2023. We\'d bring it up less if it wasn\'t true. <a href="'.$j.'">The full story\'s here</a>.</p>'],
  ['Fresh. Fast. Food.','<p>Grain-fed beef, smashed on a hot grill. Chicken breast hand-breaded and fried when you order, not a minute before. Sauces, spice blends and pickles made fresh every day, under one roof. No hormones, no preservatives, no additives. What you see is what you get.</p>'],
  ['First time? Start here.','<p>The Original. Double patty, cheese, dill pickles, white onion, mustard, ketchup, potato bun. Nothing to hide behind. Rather design your own? Build Your Own comes single or double, and in a plant-based version too.</p><p>Chicken person? The Chicken Sando comes in five heat levels, from plain to the reaper. Medium-ish is a warm hug. The reaper comes with a waiver. We\'re not joking.</p><p>Finish with a shake, made Gooder. <a href="/ae/menu/">Full menu</a>.</p><p>More Pickls down the coast in <a href="/ae/abu-dhabi/">Abu Dhabi</a> and up the road in <a href="/ae/sharjah/">Sharjah</a>.</p>'],
 ],
 'faqs'=>[
  ['Does Pickl deliver in Dubai?','Yep, on Talabat, Careem, Noon Food, Deliveroo and Keeta. Pick your app, pick your burger.'],
  ['What else has Pickl won?','Deliveroo Restaurant of the Year, four years running, 2022 to 2025. Best Homegrown in 2025. Best Fried Chicken, once.'],
  ["What's on The New Yorker?",'Double chuck patty, cheese, tomato, lettuce and secret sauce. Potato bun, naturally.'],
  ['Is there a Pickl app?','There is. Rewards, the menu and a store finder, all in your pocket.'],
 ]],
'abu-dhabi'=>[
 'title'=>'Best Burger in Abu Dhabi? Pickl, Saadiyat to WTC',
 'desc'=>"Time Out Dubai's Best Burger, 2022 and 2023. Three Pickls in Abu Dhabi: Soul Beach on Saadiyat, Khalifa City (till 4am) and WTC Mall. Find yours.",
 'fk'=>'best burger in abu dhabi,burger abu dhabi,burger restaurants in abu dhabi,pickl abu dhabi',
 'ogt'=>'Pickl Abu Dhabi','ogd'=>'Three Pickls in Abu Dhabi: Soul Beach on Saadiyat, Gardens Plaza in Khalifa City (open until 4am) and WTC Mall in the city centre. Find yours.',
 'intro'=>"Three Pickls in the capital, three very different backdrops. Looking for the best burger in Abu Dhabi? It's the same one at all three. You just pick the view.\n\nAlso in the emirate: <a href=\"$alain\">Pickl Al Ain</a>, on Plot 10 in Zakhir. The only Pickl in Al Ain, open till 2am.",
 'sections'=>[
  ['Midnight is just the halfway mark','<p>Mamsha wraps up at midnight. Khalifa City carries on till 4am, every night of the week. Your 2am self will be thrilled. Your 9am self might have notes.</p>'],
  ["The trophies stayed in Dubai. The recipe didn't.",'<p>Time Out Dubai named Pickl Best Burger in Dubai in 2022, then again in 2023. Dubai awards, won in Dubai. What came down the coast is the way the food gets made.</p>'],
  ['Simple. Not Basic.','<p>Grain-fed beef, smashed and laid on a potato bun. Chicken breast hand-breaded and fried to order. Sauces, spice blends and pickles made fresh every day. No hormones, no preservatives, no additives in the beef or the chicken.</p>'],
  ['Never had one? Easy fix.','<p>The Original goes first. After that, climb the Chicken Sando\'s five heat levels, from plain to the reaper, and stop when your eyes start watering.</p><p>Vegetarians get plant-based versions of the cheeseburgers, and there\'s Build Your Own too. The Famous Ice Cream Sando is ice cream stuffed in a deep-fried cinnamon sugar bun, so plan your stomach space accordingly. <a href="/ae/menu/">Full menu</a>.</p><p>More Pickls up the coast in <a href="/ae/dubai/">Dubai</a> and <a href="/ae/sharjah/">Sharjah</a>.</p>'],
 ],
 'faqs'=>[
  ['Does Pickl deliver in Abu Dhabi?','Yep. Talabat, Careem, Noon Food, Deliveroo and Keeta, from all three city Pickls and from Al Ain.'],
  ['Which Abu Dhabi Pickl is easiest to park at?','Corniche: the WTC Mall car park is ticketless and Salik does the billing. Khalifa City: Gardens Plaza has parking for diners.'],
  ['Is there a Pickl drive-thru near Abu Dhabi?','Head inland. <a href="'.$alain.'">Pickl Al Ain</a> opened as a drive-thru at Zakher Drive Thru Park in June 2023.'],
  ['Is Pickl from Abu Dhabi?','Close. Homegrown in Dubai, just up the coast.'],
 ]],
'sharjah'=>[
 'title'=>'Pickl Sharjah | Best Burger in Sharjah? Aljada & Al Heera',
 'desc'=>"Time Out Dubai's Best Burger, 2022 and 2023. Two Pickls in Sharjah: Aljada, open till 4am, and Al Heera Beach. No E11 needed.",
 'fk'=>'best burger in sharjah,burger sharjah,best burger sharjah,pickl sharjah,burgers in sharjah',
 'ogt'=>'Pickl Sharjah','ogd'=>'Two Pickls in Sharjah: Aljada, open until 4am, and Al Heera Beach, our first Sharjah venue. Smashed cheeseburgers and chicken sandos, no E11 needed.',
 'intro'=>"The E11 used to be the only road from Sharjah to a Pickl. Not anymore. There are two Pickls inside the emirate now, one on East Boulevard in Aljada and one on Al Heera Beach, so chasing the best burger in Sharjah no longer comes with a traffic jam.",
 'sections'=>[
  ['The E11 was getting a bit much.','<p>Plenty of you drove into Dubai for a cheeseburger. We took that as a compliment, and as a hint. Around New Year 2023 the first Sharjah Pickl opened on Al Heera Beach. Aljada makes two.</p>'],
  ['Simple. Not Basic.','<p>The trophies come from next door: Time Out Dubai named Pickl Best Burger in Dubai in 2022 and 2023. Sharjah gets the exact same burger.</p><p>The cooking travels fine. Grain-fed beef, smashed on a hot grill. Chicken breast breaded by hand and fried when you order. Sauces, spice blends and pickles made fresh every day, on the beach and on the boulevard alike.</p>'],
  ['New here? Order The Jeff burger.','<p>Or The BBQ Bacon Burger. Add a Tub O\' House Pickles in dill, onion or chilli, then a salted caramel shake to close it out. Vegetarians get plant-based versions of most of the cheeseburgers, Build Your Own included, and little legends get Little Pickl meals. <a href="/ae/menu/">Everything else is on the menu</a>.</p>'],
  ['Not in Sharjah tonight?','<p>Pickl is in <a href="/ae/dubai/">Dubai</a> and <a href="/ae/abu-dhabi/">Abu Dhabi</a> too. Head up the coast and <a href="'.$rak.'">Lagoon Stop in Ras Al Khaimah</a> is a drive-thru, so you don\'t even have to get out of the car.</p>'],
 ],
 'faqs'=>[
  ['Can I get Pickl delivered in Sharjah?','Both Sharjah Pickls are on Talabat, Careem, Noon Food, Deliveroo and Keeta. Still no E11 involved.'],
  ['Which sauces can I pick?','Comeback, secret, ranch, BBQ, Caesar, mustard or buffalo. Found the one? Go Big Boy.'],
  ['Anything lighter than a burger?','The Rocket Parma Salad. Rocket, white onion, parmesan, balsamic. Virtuous, briefly.'],
 ]],
];
$mk=['rank_math_title','rank_math_description','rank_math_focus_keyword','rank_math_facebook_title','rank_math_facebook_description'];
$bak=[];
foreach($C as $slug=>$c){ $t=get_term_by('slug',$slug,'city'); if(!$t){echo "MISSING $slug\n";exit(1);}
 foreach($mk as $k) $bak[$slug][$k]=get_term_meta($t->term_id,$k,true);
 foreach(['city_intro','city_sections','city_faqs'] as $k) $bak[$slug][$k]=get_field($k,$t);
}
echo "BACKUP ".json_encode($bak,JSON_UNESCAPED_UNICODE)."\n";
foreach($C as $slug=>$c){ $t=get_term_by('slug',$slug,'city');
 update_term_meta($t->term_id,'rank_math_title',$c['title']);
 update_term_meta($t->term_id,'rank_math_description',$c['desc']);
 update_term_meta($t->term_id,'rank_math_focus_keyword',$c['fk']);
 update_term_meta($t->term_id,'rank_math_facebook_title',$c['ogt']);
 update_term_meta($t->term_id,'rank_math_facebook_description',$c['ogd']);
 update_field('field_pickl_city_intro',$c['intro'],$t);
 update_field('field_pickl_city_sections',array_map(function($s){return ['field_pickl_city_section_heading'=>$s[0],'field_pickl_city_section_body'=>$s[1]];},$c['sections']),$t);
 update_field('field_pickl_city_faqs',array_map(function($f){return ['field_pickl_city_faq_q'=>$f[0],'field_pickl_city_faq_a'=>$f[1]];},$c['faqs']),$t);
 echo "$slug: title=".get_term_meta($t->term_id,'rank_math_title',true)." | sections=".count(get_field('city_sections',$t))." | faqs=".count(get_field('city_faqs',$t))."\n";
}
echo "alain=$alain rak=$rak\n";
