# 📚 PDF Audio Storybook - Sách Điện Tử Có Âm Thanh

Một ứng dụng web tĩnh 100% hiển thị PDF theo từng trang và tự động phát âm thanh tương ứng với trang đang xem. Được xây dựng với Vanilla HTML/CSS/JS và PDF.js.

## ✨ Tính Năng

- 📖 **Hiển thị PDF theo trang** với PDF.js rendering trên canvas
- 🎵 **Âm thanh theo trang** - mỗi trang có thể có audio riêng
- 📱 **Responsive Design** - hoạt động tốt trên mobile, tablet, desktop
- ♿ **Accessibility** - hỗ trợ screen reader, phím tắt, tabindex
- 🎮 **Điều khiển đa dạng** - phím mũi tên, vuốt trên mobile, nhập số trang
- 🔊 **Audio Player** đầy đủ - play/pause, mute/unmute, thanh tiến độ
- 💾 **Lưu trạng thái** - nhớ trang cuối và trạng thái mute
- ⚡ **Prefetching** - tải trước trang và audio tiếp theo để chuyển trang mượt
- 🌐 **Static Only** - không cần server backend, chạy từ file hoặc static hosting

## 🛠️ Cài Đặt & Chạy

### Chạy cục bộ

1. **Mở trực tiếp từ file:**
   ```bash
   # Mở file public/index.html bằng trình duyệt
   ```

2. **Sử dụng HTTP server (khuyến nghị):**
   ```bash
   # Với Python
   cd public
   python -m http.server 8000
   
   # Với Node.js
   npx http-server public -p 8000
   
   # Với PHP
   cd public
   php -S localhost:8000
   ```

3. **Truy cập:** http://localhost:8000

### Deploy lên Static Hosting

#### GitHub Pages
1. Push code lên GitHub repository
2. Vào Settings → Pages
3. Chọn source branch và `/public` folder
4. Website sẽ có sẵn tại `https://username.github.io/repository-name`

#### Netlify
1. Kéo thả thư mục `public` vào Netlify
2. Hoặc connect với GitHub repository
3. Set build command: `cp -r public/* .`

#### Vercel
1. Import project từ GitHub
2. Set output directory: `public`

## 📁 Cấu Trúc Dự Án

```
public/
├── index.html              # Trang chính
├── styles.css              # CSS responsive với dark mode
├── app.js                  # JavaScript chính với PDF.js
├── sw.js                   # Service Worker (tùy chọn)
├── manifest.json           # PWA manifest
├── assets/
│   ├── config.json         # Cấu hình sách và audio
│   ├── audio/              # Thư mục chứa file âm thanh
│   │   ├── p1.wav         # Audio cho trang 1
│   │   ├── p2.wav         # Audio cho trang 2
│   │   └── ...
│   └── pdf/
│       └── book.pdf        # File PDF chính
└── vendor/pdfjs/
    ├── pdf.min.js          # PDF.js library
    └── pdf.worker.min.js   # PDF.js worker
```

## ⚙️ Cấu Hình

### File `assets/config.json`

```json
{
  "pdf": "assets/pdf/book.pdf",
  "title": "Tên Sách Của Bạn",
  "autoplay": true,
  "startMuted": false,
  "loop": false,
  "totalPages": 5,
  "pages": {
    "1": { 
      "audio": "assets/audio/p1.wav", 
      "title": "Giới thiệu",
      "description": "Chào mừng đến với câu chuyện"
    },
    "2": { 
      "audio": "assets/audio/p2.wav", 
      "title": "Chương 1",
      "description": "Cuộc phiêu lưu bắt đầu"
    }
  }
}
```

### Các tùy chọn cấu hình:

- `pdf`: Đường dẫn đến file PDF
- `title`: Tiêu đề sách
- `autoplay`: Tự động phát audio khi chuyển trang
- `startMuted`: Bắt đầu với âm thanh tắt
- `loop`: Lặp lại audio khi kết thúc
- `pages`: Object chứa cấu hình cho từng trang
  - `audio`: Đường dẫn file audio (mp3, wav, ogg)
  - `title`: Tiêu đề trang
  - `description`: Mô tả trang

## 🎵 Thêm Âm Thanh

1. **Thêm file audio:**
   ```bash
   # Copy file audio vào thư mục assets/audio/
   cp your-audio.mp3 public/assets/audio/p6.mp3
   ```

2. **Cập nhật config.json:**
   ```json
   {
     "pages": {
       "6": {
         "audio": "assets/audio/p6.mp3",
         "title": "Chương mới"
       }
     }
   }
   ```

3. **Định dạng audio được hỗ trợ:**
   - MP3 (khuyến nghị - tương thích rộng)
   - WAV (chất lượng cao)
   - OGG (open source)
   - M4A (iOS/Safari)

## ⌨️ Phím Tắt

- `←/→` - Chuyển trang trước/tiếp
- `Space` - Play/Pause audio
- `M` - Tắt/Bật tiếng
- `+/-` - Zoom in/out

## 📱 Sử Dụng Trên Mobile

- **Vuốt trái** - Trang tiếp theo
- **Vuốt phải** - Trang trước
- **Tap vào overlay** - Bật âm thanh
- **Pinch to zoom** - Thu phóng (nếu hỗ trợ)

## 🌙 Dark Mode & Accessibility

- Tự động theo system preference
- Screen reader support với ARIA labels
- High contrast mode support
- Reduced motion support
- Keyboard navigation đầy đủ

## 🚀 Tối Ưu Hiệu Suất

### Prefetching
- Tự động tải trước trang PDF tiếp theo
- Prefetch audio file của trang tiếp theo
- Cache management để tránh memory leak

### Image Optimization
```javascript
// Trong app.js, có thể điều chỉnh scale cho phù hợp
this.scale = 1.5; // Giảm xuống 1.0 cho mobile cũ
```

### Audio Compression
```bash
# Nén audio để tải nhanh hơn
ffmpeg -i input.wav -b:a 128k output.mp3
```

## 🔧 Xử Lý Sự Cố

### Autoplay bị chặn trên iOS/Safari
- Ứng dụng đã có overlay "Enable Sound"
- User phải tương tác trước khi audio có thể tự phát

### PDF không tải được
- Kiểm tra đường dẫn trong config.json
- Đảm bảo file PDF không bị corrupt
- Kiểm tra CORS nếu serve từ domain khác

### Audio không phát
- Kiểm tra format audio được browser hỗ trợ
- Kiểm tra đường dẫn trong config.json
- Mở Developer Tools để xem lỗi

### Mobile performance kém
- Giảm `scale` trong app.js
- Sử dụng audio với bitrate thấp hơn
- Enable service worker để cache

## 🔄 Service Worker (Offline Mode)

Service worker đã được bao gồm để cache các file tĩnh:

```javascript
// Trong sw.js
const CACHE_NAME = 'pdf-storybook-v1';
const urlsToCache = [
  './',
  './styles.css',
  './app.js',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js'
];
```

**Bật/tắt service worker:**
- Xóa đoạn script registration trong index.html nếu không muốn cache
- Hoặc thay đổi `CACHE_NAME` để force update

## 📚 Tạo PDF Mẫu

Để test, bạn có thể tạo PDF mẫu:

```python
# Tạo PDF 5 trang đơn giản
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

def create_sample_pdf():
    c = canvas.Canvas("public/assets/pdf/book.pdf", pagesize=letter)
    
    for i in range(1, 6):
        c.drawString(100, 750, f"Page {i}")
        c.drawString(100, 700, f"This is the content of page {i}")
        c.drawString(100, 650, "Sample PDF for Audio Storybook")
        c.showPage()
    
    c.save()

create_sample_pdf()
```

## 🤝 Đóng Góp

1. Fork dự án
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Mở Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## 🙏 Acknowledgments

- [PDF.js](https://github.com/mozilla/pdf.js/) - PDF rendering
- [Mozilla](https://mozilla.org/) - PDF.js development
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

**Made with ❤️ for Vietnamese readers**

🌟 **Star this repo if you find it useful!**
