# 3D Model Manager

Một nền tảng web đơn giản để team nhỏ quản lý và hiển thị các model 3D locally, với các tính năng tùy chỉnh hiển thị, embed, upload, loading tốt, giao diện đẹp, quản lý người dùng, và triển khai dễ dàng qua CI/CD.

## Tính năng

- **Upload và Quản lý Model 3D**: Hỗ trợ các định dạng GLB, GLTF, USDZ.
- **Tùy chỉnh Hiển thị 3D**: Điều khiển camera, ánh sáng, vật liệu, hiệu ứng.
- **Hotspots/Annotations**: Thêm chú thích vào các vị trí cụ thể trên model.
- **Embed Code**: Tạo mã nhúng để chia sẻ model trên các trang web khác.
- **Hỗ trợ AR**: Xem model trong thực tế ảo tăng cường (AR) trên thiết bị di động.
- **Quản lý Người dùng**: Đăng ký, đăng nhập, quản lý hồ sơ.
- **Giao diện Responsive**: Hoạt động tốt trên desktop và thiết bị di động.

## Yêu cầu Hệ thống

- Node.js (v14.0.0 trở lên)
- NPM hoặc Yarn
- SQLite3

## Cài đặt

1. Clone repository:
   ```bash
   git clone https://github.com/yourusername/3d-model-manager.git
   cd 3d-model-manager
   ```

2. Cài đặt dependencies:
   ```bash
   npm install
   ```

3. Tạo file `.env` (hoặc chỉnh sửa file hiện có):
   ```
   PORT=3000
   SESSION_SECRET=your_session_secret_key
   UPLOAD_DIR=uploads
   DB_PATH=database.sqlite
   ```

4. Khởi tạo cơ sở dữ liệu:
   ```bash
   node db-init.js
   ```

5. Khởi động server:
   ```bash
   npm start
   ```

6. Truy cập ứng dụng tại `http://localhost:3000`

## Sử dụng

### Đăng ký và Đăng nhập

- Truy cập trang chủ và nhấp vào "Register" để tạo tài khoản mới.
- Đăng nhập bằng tài khoản đã tạo hoặc sử dụng tài khoản demo (username: `admin`, password: `admin123`).

### Upload Model 3D

1. Đăng nhập vào hệ thống.
2. Nhấp vào "Upload Model" trên thanh điều hướng.
3. Điền thông tin model và chọn file model 3D (GLB, GLTF, hoặc USDZ).
4. Nhấp vào "Upload Model" để tải lên.

### Xem và Tùy chỉnh Model

1. Truy cập trang "Models" hoặc "Dashboard" để xem danh sách model.
2. Nhấp vào "View" để xem chi tiết model.
3. Sử dụng các điều khiển camera để xoay, zoom, và di chuyển model.
4. Sử dụng các tùy chọn bên phải để điều chỉnh ánh sáng, bóng đổ, và các thuộc tính khác.

### Thêm Hotspots

1. Khi xem model, nhấp vào "Add Hotspot".
2. Nhập tên và nội dung cho hotspot.
3. Nhấp vào model để chọn vị trí cho hotspot.
4. Nhấp vào "Save Hotspot" để lưu.

### Tạo Embed Code

1. Khi xem model, nhấp vào "Embed".
2. Sao chép mã nhúng được tạo.
3. Dán mã này vào trang web khác để hiển thị model 3D.

## Cấu trúc Dự án

```
3d-model-manager/
├── db.js                # Cấu hình cơ sở dữ liệu
├── middleware/          # Middleware Express
├── public/              # Tài nguyên tĩnh (CSS, JS, uploads)
├── routes/              # Route handlers
├── server.js            # Entry point
├── uploads/             # Thư mục lưu trữ model đã upload
└── views/               # EJS templates
```

## Công nghệ Sử dụng

- **Frontend**: HTML, CSS, JavaScript, Bootstrap 5
- **3D Rendering**: Google Model Viewer
- **Backend**: Node.js, Express
- **Database**: SQLite3
- **Template Engine**: EJS
- **Authentication**: Express Session, bcrypt

## Triển khai

### Triển khai trên Vercel

1. Fork repository này trên GitHub.
2. Tạo một dự án mới trên Vercel và liên kết với repository GitHub của bạn.
3. Cấu hình các biến môi trường trong Vercel:
   - `SESSION_SECRET`: Một chuỗi bí mật ngẫu nhiên
   - `UPLOAD_DIR`: `uploads`
   - `DB_PATH`: `database.sqlite`
4. Deploy!

### Triển khai trên VPS/Server

1. Clone repository trên server:
   ```bash
   git clone https://github.com/yourusername/3d-model-manager.git
   cd 3d-model-manager
   ```

2. Cài đặt dependencies và build:
   ```bash
   npm install
   ```

3. Sử dụng PM2 để chạy ứng dụng:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "3d-model-manager"
   ```

4. Cấu hình Nginx hoặc Apache để proxy requests đến ứng dụng Node.js.

## Đóng góp

Đóng góp luôn được chào đón! Vui lòng tạo issue hoặc pull request trên GitHub.

## Giấy phép

Dự án này được phân phối dưới giấy phép MIT. Xem file `LICENSE` để biết thêm chi tiết. 