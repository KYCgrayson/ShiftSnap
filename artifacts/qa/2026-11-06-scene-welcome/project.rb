require 'xcodeproj'
require 'pathname'
dir = File.dirname(__FILE__)
Dir.chdir(dir)
proj = Xcodeproj::Project.new('Visibility.xcodeproj')
host = proj.new_target(:application, 'VisibilityHost', :ios, '16.0')
ui = proj.new_target(:ui_test_bundle, 'VisibilityUI', :ios, '16.0')
host.source_build_phase.add_file_reference(proj.main_group.new_file('Host.swift'))
ui.source_build_phase.add_file_reference(proj.main_group.new_file('VisibilityTests.swift'))
ui.add_dependency(host)
[[host, 'com.ishift.qa.VisibilityHost'],[ui,'com.ishift.qa.VisibilityUI']].each do |target, bundle|
  target.build_configurations.each do |conf|
    conf.build_settings.merge!('PRODUCT_BUNDLE_IDENTIFIER'=>bundle,'GENERATE_INFOPLIST_FILE'=>'YES','SWIFT_VERSION'=>'5.0','CODE_SIGNING_ALLOWED'=>'YES','CODE_SIGN_IDENTITY'=>'-','TARGETED_DEVICE_FAMILY'=>'1,2','SUPPORTED_PLATFORMS'=>'iphonesimulator')
    conf.build_settings['TEST_TARGET_NAME']='VisibilityHost' if target==ui
  end
end
proj.save
scheme=Xcodeproj::XCScheme.new
scheme.add_build_target(host)
scheme.add_test_target(ui)
scheme.set_launch_target(host)
scheme.save_as(proj.path, 'Visibility', true)
