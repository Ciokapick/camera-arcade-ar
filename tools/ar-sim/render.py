# Randează o masă texturată văzută de o cameră de telefon care se mișcă; scrie table.y4m (I420) + traiectoria.
import numpy as np, json, sys
from PIL import Image, ImageDraw, ImageFilter
rng = np.random.default_rng(3)
W, H, FPS, SECS = 480, 640, 30, 14
FOV_LONG = 67.0  # pe latura lungă (H)
f = (H / 2) / np.tan(np.radians(FOV_LONG / 2))
# textura mesei: 1.2 m x 1.2 m, 2400 px (0.5 mm/px)
T = 2400; S = 1.2
img = Image.new('RGB', (T, T), (196, 160, 118))
d = ImageDraw.Draw(img)
for i in range(900):  # fibra lemnului + pete
    y = rng.uniform(0, T); c = int(rng.uniform(120, 200))
    d.line([(0, y), (T, y + rng.uniform(-40, 40))], fill=(c, int(c * 0.78), int(c * 0.55)), width=int(rng.uniform(1, 5)))
for i in range(700):  # „obiecte” mici: hârtii, pete, litere — puncte de urmărit
    x, y, r = rng.uniform(0, T), rng.uniform(0, T), rng.uniform(4, 30)
    col = tuple(int(v) for v in rng.uniform(20, 255, 3))
    if rng.random() < 0.5: d.ellipse([x - r, y - r, x + r, y + r], fill=col)
    else: d.rectangle([x - r, y - r * 0.6, x + r, y + r * 0.6], outline=col, width=3)
# crucea roșie în origine (adevărul)
c = T // 2
d.rectangle([c - 40, c - 6, c + 40, c + 6], fill=(255, 0, 0)); d.rectangle([c - 6, c - 40, c + 6, c + 40], fill=(255, 0, 0))
tex = np.asarray(img.filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
# peretele din spate (z = -0.7), textură grosieră
wall = np.asarray(Image.fromarray((rng.uniform(90, 200, (60, 120, 3))).astype(np.uint8)).resize((1200, 600), Image.NEAREST).filter(ImageFilter.GaussianBlur(2))).astype(np.float32)

def look_at(eye, target):
    fwd = target - eye; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    return right, up, fwd

ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
dx = (xs + 0.5 - W / 2) / f; dy = -(ys + 0.5 - H / 2) / f
traj = []
out = open('.out/table.y4m', 'wb')
out.write(f'YUV4MPEG2 W{W} H{H} F3:2 Ip A1:1 C420jpeg\n'.encode())  # 1,5 fps redat = încetinit de 20× (cât procesează browserul fără GPU)
for k in range(FPS * SECS):
    t = k / FPS
    # periodic (video-ul se redă în buclă, fără salt): stânga–dreapta lent, puțin sus–jos și înainte–înapoi
    w = 2 * np.pi / SECS
    eye = np.array([0.10 * np.sin(w * t), 0.42 + 0.03 * np.sin(2 * w * t), 0.33 + 0.05 * np.cos(w * t)])
    target = np.array([0.02 * np.sin(w * t), 0.0, 0.0])
    R, U, F = look_at(eye, target)
    dirs = dx[..., None] * R + dy[..., None] * U + F
    rgb = np.zeros((H, W, 3), np.float32) + 40
    # masa y = 0
    tt = -eye[1] / dirs[..., 1]
    hit = (tt > 0)
    px = eye[0] + dirs[..., 0] * tt; pz = eye[2] + dirs[..., 2] * tt
    u = ((px / S + 0.5) * T); v = ((pz / S + 0.5) * T)
    on = hit & (u >= 0) & (u < T - 1) & (v >= 0) & (v < T - 1) & (pz > -0.6)
    rgb[on] = tex[v[on].astype(int), u[on].astype(int)]
    # perete z = -0.6
    tw = (-0.6 - eye[2]) / dirs[..., 2]
    wy = eye[1] + dirs[..., 1] * tw; wx = eye[0] + dirs[..., 0] * tw
    onw = (tw > 0) & ~on & (wy >= 0) & (wy < 0.6) & (np.abs(wx) < 1.2)
    rgb[onw] = wall[np.clip(((0.6 - wy[onw]) / 0.6 * 599).astype(int), 0, 599), np.clip(((wx[onw] + 1.2) / 2.4 * 1199).astype(int), 0, 1199)]
    rgb += rng.normal(0, 2, rgb.shape)  # zgomot de senzor
    rgb = np.clip(rgb, 0, 255)
    Y = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    Cb = 128 - 0.168736 * rgb[..., 0] - 0.331264 * rgb[..., 1] + 0.5 * rgb[..., 2]
    Cr = 128 + 0.5 * rgb[..., 0] - 0.418688 * rgb[..., 1] - 0.081312 * rgb[..., 2]
    sub = lambda c: c.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
    out.write(b'FRAME\n'); out.write(Y.astype(np.uint8).tobytes()); out.write(sub(Cb).astype(np.uint8).tobytes()); out.write(sub(Cr).astype(np.uint8).tobytes())
    traj.append({'t': t, 'eye': eye.tolist(), 'target': target.tolist()})
    if k == 0: Image.fromarray(rgb.astype(np.uint8)).save('.out/frame0.png')
    if k == 150: Image.fromarray(rgb.astype(np.uint8)).save('.out/frame150.png')
out.close()
json.dump(traj, open('.out/traj.json', 'w'))
print('ok', f)
