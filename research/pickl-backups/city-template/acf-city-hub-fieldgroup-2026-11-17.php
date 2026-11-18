<?php
if (!function_exists('acf_import_field_group')) { echo "NO ACF IMPORT\n"; exit(1); }
foreach (acf_get_field_groups() as $g) { if ($g['key']==='group_pickl_city_hub') { echo "EXISTS ".$g['ID']."\n"; exit(1);} }
$g = acf_import_field_group(array(
 'key'=>'group_pickl_city_hub','title'=>'City - Hub content',
 'fields'=>array(
  array('key'=>'field_pickl_city_intro','label'=>'Intro','name'=>'city_intro','type'=>'textarea','rows'=>5,'new_lines'=>'',
        'instructions'=>'Shown under the H1. Replaces the default "Find your nearest Pickl..." line. Blank line = new paragraph.'),
  array('key'=>'field_pickl_city_sections','label'=>'Copy sections','name'=>'city_sections','type'=>'repeater','layout'=>'block','button_label'=>'Add section',
        'instructions'=>'Shown after the venue cards, before the menu tiles.',
        'sub_fields'=>array(
          array('key'=>'field_pickl_city_section_heading','label'=>'Heading','name'=>'heading','type'=>'text'),
          array('key'=>'field_pickl_city_section_body','label'=>'Body','name'=>'body','type'=>'wysiwyg','tabs'=>'all','toolbar'=>'basic','media_upload'=>0),
        )),
  array('key'=>'field_pickl_city_faqs','label'=>'FAQs','name'=>'city_faqs','type'=>'repeater','layout'=>'block','button_label'=>'Add FAQ',
        'instructions'=>'Shown at the bottom of the city page.',
        'sub_fields'=>array(
          array('key'=>'field_pickl_city_faq_q','label'=>'Question','name'=>'question','type'=>'text'),
          array('key'=>'field_pickl_city_faq_a','label'=>'Answer','name'=>'answer','type'=>'textarea','rows'=>3,'new_lines'=>''),
        )),
 ),
 'location'=>array(array(array('param'=>'taxonomy','operator'=>'==','value'=>'city'))),
 'active'=>true,'menu_order'=>0,
));
echo "CREATED ".$g['ID']." ".$g['title']."\n";
foreach (acf_get_fields('group_pickl_city_hub') as $f) echo "  ".$f['name']." (".$f['type'].")\n";
