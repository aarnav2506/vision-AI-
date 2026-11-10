#!/usr/bin/env ruby
# frozen_string_literal: true

require 'webrick'
require 'json'
require 'base64'
require 'fileutils'
require 'time'

# Allow directories with trailing spaces on macOS and enable CORS OPTIONS on ProcHandler
module WEBrick
  module HTTPServlet
    class FileHandler
      def windows_ambiguous_name?(_name)
        false
      end
    end

    class ProcHandler
      alias do_OPTIONS do_GET
    end
  end
end

ROOT_DIR   = File.expand_path(__dir__)
DB_DIR     = File.join(ROOT_DIR, 'database')
USERS_DIR  = File.join(DB_DIR, 'users')
PHOTOS_DIR = File.join(DB_DIR, 'photos')
VOICE_DIR  = File.join(DB_DIR, 'voice')
USERS_JSON = File.join(DB_DIR, 'users.json')
TXT_FILE   = File.join(DB_DIR, 'user_data.txt')

FileUtils.mkdir_p([DB_DIR, USERS_DIR, PHOTOS_DIR, VOICE_DIR])

unless File.exist?(USERS_JSON)
  File.write(USERS_JSON, JSON.pretty_generate([]))
end

unless File.exist?(TXT_FILE)
  header = <<~HEADER
    ================================================================================
    VISIONPULSE STUDIO — LOCAL ACTIVITY & TRAINING LOG (user_data.txt)
    Created: #{Time.now.iso8601}
    Save Folders: database/photos/*.jpg | database/voice/*.wav | database/user_data.txt
    ================================================================================

  HEADER
  File.write(TXT_FILE, header)
end

def read_users
  JSON.parse(File.read(USERS_JSON))
rescue StandardError
  []
end

def write_users(users)
  File.write(USERS_JSON, JSON.pretty_generate(users))
end

def append_txt_entry(category, fields)
  timestamp = Time.now.strftime('%Y-%m-%d %H:%M:%S')
  lines = ["[#{timestamp}] === #{category.upcase} ==="]
  fields.each do |k, v|
    lines << "  #{k.to_s.ljust(22)} : #{v}"
  end
  lines << "-" * 68
  lines << ""
  File.open(TXT_FILE, 'a') { |f| f.puts(lines.join("\n")) }
end

def sanitize_filename(str)
  s = str.to_s.downcase.gsub(/[^a-z0-9_-]+/, '_').gsub(/^_+|_+$/, '')[0, 36]
  s.empty? ? 'subject' : s
end

def save_data_url_file(data_url, target_path)
  return nil if data_url.nil? || data_url.empty?

  raw_base64 = data_url.sub(%r{\Adata:[^;]+;base64,}, '')
  File.binwrite(target_path, Base64.decode64(raw_base64))
  target_path
end

PORT = (ENV['PORT'] || 8080).to_i

server = WEBrick::HTTPServer.new(
  Port: PORT,
  BindAddress: '127.0.0.1',
  DocumentRoot: ROOT_DIR,
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

def apply_cors(res)
  res['Access-Control-Allow-Origin'] = '*'
  res['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  res['Access-Control-Allow-Headers'] = 'Content-Type'
  res['Access-Control-Allow-Private-Network'] = 'true'
end

def json_response(res, status, payload)
  apply_cors(res)
  res.status = status
  res['Content-Type'] = 'application/json; charset=utf-8'
  res['Cache-Control'] = 'no-store'
  res.body = JSON.generate(payload)
end

# GET /api/status
server.mount_proc '/api/status' do |req, res|
  if req.request_method == 'OPTIONS'
    json_response(res, 200, { ok: true })
    next
  end

  users = read_users
  photos = Dir.glob(File.join(PHOTOS_DIR, '*.jpg')).map { |f| File.basename(f) }.sort.reverse
  voices = Dir.glob(File.join(VOICE_DIR, '*.wav')).map { |f| File.basename(f) }.sort.reverse
  txt_content = File.exist?(TXT_FILE) ? File.read(TXT_FILE) : ''

  json_response(res, 200, {
    ok: true,
    save_location: 'database/photos/ & database/voice/ & database/user_data.txt',
    users_count: users.size,
    photos_count: photos.size,
    voices_count: voices.size,
    recent_photos: photos.first(12),
    recent_voices: voices.first(12),
    users: users,
    txt_preview: txt_content.lines.last(80).join
  })
end

# GET /api/user-data-txt
server.mount_proc '/api/user-data-txt' do |req, res|
  apply_cors(res)
  if req.request_method == 'OPTIONS'
    res.status = 200
    next
  end
  res.status = 200
  res['Content-Type'] = 'text/plain; charset=utf-8'
  res['Cache-Control'] = 'no-store'
  res.body = File.exist?(TXT_FILE) ? File.read(TXT_FILE) : ''
end

# POST /api/register-user
server.mount_proc '/api/register-user' do |req, res|
  if req.request_method == 'OPTIONS'
    json_response(res, 200, { ok: true })
    next
  end
  if req.request_method != 'POST'
    json_response(res, 405, { ok: false, error: 'Method Not Allowed' })
    next
  end

  begin
    body = JSON.parse(req.body.to_s)
    name = (body['name'] || 'Registered Member').strip
    role = (body['role'] || 'Authorized Profile').strip
    signature = body['signature'] || []
    photo_data = body['photoDataUrl']

    ts = Time.now.strftime('%Y%m%d_%H%M%S')
    slug = sanitize_filename(name)
    user_id = "#{slug}_#{ts}"
    photo_filename = "#{user_id}.jpg"
    photo_rel_path = "database/users/#{photo_filename}"

    if photo_data && !photo_data.empty?
      save_data_url_file(photo_data, File.join(USERS_DIR, photo_filename))
    end

    users = read_users
    user_record = {
      id: user_id,
      name: name,
      role: role,
      registeredAt: Time.now.iso8601,
      photoUrl: photo_data || "/#{photo_rel_path}",
      signature: signature
    }
    users << user_record
    write_users(users)

    tel = body['telemetry'] || {}
    append_txt_entry('PROFILE ENROLLED', {
      'Profile ID' => user_id,
      'Display Name' => name,
      'Role' => role,
      'GPS Coordinates' => tel['gpsCoords'] || 'Pending Permission',
      'Approx Location' => tel['approxLocation'] || 'Local',
      'IP / Network' => tel['ipInfo'] || req.peeraddr[3] || '127.0.0.1',
      'OS & Browser' => tel['deviceInfo'] || req['User-Agent'],
      'Saved File' => photo_rel_path
    })

    json_response(res, 200, { ok: true, user: user_record })
  rescue StandardError => e
    json_response(res, 500, { ok: false, error: e.message })
  end
end

# POST /api/delete-user
server.mount_proc '/api/delete-user' do |req, res|
  if req.request_method == 'OPTIONS'
    json_response(res, 200, { ok: true })
    next
  end
  if req.request_method != 'POST'
    json_response(res, 405, { ok: false, error: 'Method Not Allowed' })
    next
  end

  begin
    body = JSON.parse(req.body.to_s)
    user_id = body['id'].to_s
    users = read_users
    users.reject! { |u| u['id'] == user_id }
    write_users(users)
    json_response(res, 200, { ok: true, users: users })
  rescue StandardError => e
    json_response(res, 500, { ok: false, error: e.message })
  end
end

# POST /api/save-capture
server.mount_proc '/api/save-capture' do |req, res|
  if req.request_method == 'OPTIONS'
    json_response(res, 200, { ok: true })
    next
  end
  if req.request_method != 'POST'
    json_response(res, 405, { ok: false, error: 'Method Not Allowed' })
    next
  end

  begin
    body = JSON.parse(req.body.to_s)
    subject = sanitize_filename(body['subject'] || 'subject')
    action_label = sanitize_filename(body['action'] || 'motion')
    expression_label = sanitize_filename(body['expression'] || 'neutral')
    ts = Time.now.strftime('%Y%m%d_%H%M%S')

    saved_photo = nil
    saved_voice = nil

    if body['photoDataUrl'] && !body['photoDataUrl'].empty?
      photo_name = "#{subject}_#{expression_label}_#{action_label}_#{ts}.jpg"
      save_data_url_file(body['photoDataUrl'], File.join(PHOTOS_DIR, photo_name))
      saved_photo = "database/photos/#{photo_name}"
    end

    if body['voiceDataUrl'] && !body['voiceDataUrl'].empty?
      voice_name = "#{subject}_#{ts}.wav"
      save_data_url_file(body['voiceDataUrl'], File.join(VOICE_DIR, voice_name))
      saved_voice = "database/voice/#{voice_name}"
    end

    tel = body['telemetry'] || {}
    append_txt_entry(body['captureType'] || 'TRAINING & SENSOR EVENT', {
      'Subject' => body['subject'] || 'Subject',
      'Confidence' => "#{body['matchConfidence'] || 95}%",
      'Expression' => body['expression'] || 'Neutral',
      'Action / Motion' => body['action'] || 'Stationary',
      'Motion Score' => "#{body['motionScore'] || 0}%",
      'Security Grade' => "#{body['securityGrade'] || 'A+'} (#{body['securityScore'] || 96}/100)",
      'GPS Coordinates' => tel['gpsCoords'] || 'Pending Permission',
      'Approx Location' => tel['approxLocation'] || 'Local',
      'IP / Network' => tel['ipInfo'] || req.peeraddr[3] || '127.0.0.1',
      'OS & Browser' => tel['deviceInfo'] || req['User-Agent'],
      'Saved Photo' => saved_photo || 'None',
      'Saved Audio' => saved_voice || 'None'
    })

    json_response(res, 200, {
      ok: true,
      savedPhoto: saved_photo,
      savedVoice: saved_voice
    })
  rescue StandardError => e
    json_response(res, 500, { ok: false, error: e.message })
  end
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

puts "VisionPulse AI Studio running on http://localhost:#{PORT}"
server.start
