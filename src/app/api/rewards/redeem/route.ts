import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { rewardId } = await req.json();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { email: session.user.email! } });
      const reward = await tx.reward.findUnique({ where: { id: rewardId } });

      if (!user || !reward) throw new Error('Dữ liệu không hợp lệ');
      if (user.points < reward.pointCost) throw new Error('Số điểm dư không đủ để thực hiện đổi phần thưởng này');
      if (reward.stock <= 0) throw new Error('Phần thưởng đã hết hàng trong kho');

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { points: user.points - reward.pointCost }
      });

      await tx.reward.update({
        where: { id: reward.id },
        data: { stock: reward.stock - 1 }
      });

      await tx.transaction.create({
        data: {
          userId: user.id,
          amount: -reward.pointCost,
          type: 'REDEEM',
          description: `Đổi phần thưởng: ${reward.title}`
        }
      });

      const order = await tx.rewardOrder.create({
        data: {
          userId: user.id,
          rewardId: reward.id,
          pointCost: reward.pointCost,
          status: 'PENDING'
        }
      });

      return order;
    });

    return NextResponse.json({ success: true, order: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi giao dịch' }, { status: 400 });
  }
}
