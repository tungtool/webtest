import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized: Vui lòng đăng nhập' }, { status: 401 });
    }

    const { urls } = await req.json();

    if (!Array.isArray(urls) || urls.length === 0 || urls.length > 10) {
      return NextResponse.json({ error: 'Số lượng liên kết không hợp lệ (Cho phép từ 1 đến 10 link)' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: 'Không tìm thấy thông tin người dùng' }, { status: 404 });
    }

    const api_token = process.env.LINK4M_API_TOKEN || '6af327b3006b802c51010213';
    const results = [];

    for (const urlStr of urls) {
      try {
        const parsedUrl = new URL(urlStr);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) continue;
        
        const hostname = parsedUrl.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
          continue;
        }

        const long_url = encodeURIComponent(parsedUrl.toString());
        const api_url = `https://link4m.co/api-shorten/v2?api=${api_token}&url=${long_url}`;

        const response = await fetch(api_url);
        const result = await response.json();

        if (result.status !== 'success') {
          results.push({
            originalUrl: parsedUrl.toString(),
            error: result.message || 'Lỗi rút gọn từ Link4M',
            status: 'FAILED'
          });
        } else {
          results.push({
            originalUrl: parsedUrl.toString(),
            shortenedUrl: result.shortenedUrl,
            status: 'SUCCESS'
          });

          await prisma.linkLog.create({
            data: {
              userId: user.id,
              url: result.shortenedUrl,
              status: 'PENDING'
            }
          });
        }
      } catch (err) {
        results.push({
          originalUrl: urlStr,
          error: 'Lỗi kết nối hoặc định dạng không hợp lệ',
          status: 'FAILED'
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xử lý hàng đợi liên kết qua Link4M thành công.',
      data: results
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống nội bộ' }, { status: 500 });
  }
}
