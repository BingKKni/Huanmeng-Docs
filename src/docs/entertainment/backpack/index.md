# 🧰 保险箱

---

保险箱用于存放小人类自己的所有道具。每位小人类都有属于自己的一个保险箱，{blue}默认负重上限{} 为 **100**。

## 保险箱的作用

### 查看与使用道具

保险箱内的所有道具都有它独立的介绍，小人类可以点击对应道具的 {blue}蓝色字体{} 部分来 **📖查看物品介绍**，了解这个物品是干嘛用的。

![查看物品介绍按钮示例](/img/backpack/view_item_intro_button.png){.hm-center-img width="500"}

部分道具是可以使用的。在查看物品介绍界面上，小人类可以点击下方的 **📱{blue}使用道具{}** 来使用这个道具。

::: warning
**道具一旦使用，不可撤销。**
:::

![使用道具按钮示例](/img/backpack/use_item_button.png){.hm-center-img width="500"}

### 容量上限

保险箱的容量上限根据 {blue}背包等级{} 决定，等级越高，上限越多。

![保险箱容量与背包等级](/img/backpack/capacity_by_backpack_level.png){.hm-center-img width="400"}

### 道具来源

目前小人类可以通过 **达成成就**、**接收幻梦推送的每周礼物** 来获得道具。

{gray}（下方第一张图为幻梦频道，第二张为幻梦群）{}

![幻梦频道每周礼物](/img/backpack/weekly_gift_channel.png){.hm-right-img height="350"}![幻梦群每周礼物](/img/backpack/weekly_gift_group.png){.hm-left-img height="350"}

## 负重上限

每个小人类的基础负重倍率为 **200**，则负重上限的计算公式为：

$$
MaxHoldWeight = math.ceil(BackpackLevel^{1.41} \times WeightRate)
$$

其中：

- **BackpackLevel** 为背包等级。
- **WeightRate** 为负重倍率。

比如有位小人类，她的背包等级是 20 级，负重倍率是基础的 200，那么她的负重上限为：

$$
BasicWeight = 20^{1.41} \times 200 = 13660.9936527139517...
$$

$$
MaxHoldWeight = math.ceil(BasicWeight) = 13661
$$

## 负重溢出

::: warning
请认真阅读本节中的加粗文字。
:::

![保险箱负重溢出示例](/img/backpack/overflow_overview.png){.hm-center-img width="500"}

当小人类的保险箱负重已满时，若此时又获得了新的道具，该道具将进入 **🕒倒计时** 阶段：

- 道具若进入倒计时阶段，将开始为期 {blue}1 天 ~ 7 天{} 的计时{gray}（道具的负重越大，计时时间越短）{}。
- **倒计时期限满后，会进行一次判定**：若保险箱总负重未超过上限，道具状态将转为正常；否则该道具将被 **🔒锁定**。
- 正在被计时的道具{gray}不会{}占用保险箱负重；被锁定的道具{red}仍会{}占用该道具 **10%** 比例的负重。
- 道具被锁定后可以随时再解锁，但解锁需消耗一定额度。
- 道具一旦被锁定，将不再可使用或出售，直到小人类主动解锁它。
- 道具解锁后，若此时总负重仍超过可持有负重上限，该道具将再次进入 1 ~ 7 天倒计时阶段。
- **道具的锁定倒计时通常不会自动结束。** {red}如果小人类某个道具正在处于倒计时阶段，即便通过各种手段扩容使保险箱不再超重，道具也不会立即恢复到普通状态{}，需要等到倒计时结束后，系统判定为未超重才能恢复正常。

::: info
上述规则适用于获得**非期限**（永久时效）道具时的情况。
:::

<!-- hm-table: smart; widths=4em,5em,6em,7em; min=24em; center -->
| 品质图标 | 品质 | 倒计时 | 解锁消耗 |
| :-: | :-: | :-: | :-: |
| ![](/img/backpack/qualities/common.png){width="36"} | 普通 | 7 天 | 20 额度 |
| ![](/img/backpack/qualities/rare.png){width="36"} | 罕见 | 6 天 | 30 额度 |
| ![](/img/backpack/qualities/scarce.png){width="36"} | 稀有 | 5 天 | 50 额度 |
| ![](/img/backpack/qualities/epic.png){width="36"} | 史诗 | 3 天 | 80 额度 |
| ![](/img/backpack/qualities/legendary.png){width="36"} | 传说 | 2 天 | 100 额度 |
| ![](/img/backpack/qualities/mythic.png){width="36"} | 神话 | 1 天 | 200 额度 |
| ![](/img/backpack/qualities/supreme.png){width="36"} | 无上 | 1 天 | 500 额度 |
| ![](/img/backpack/qualities/special.png){width="36"} | 特殊 | 1 天 | 500 额度 |
| ![](/img/backpack/qualities/limited.png){width="36"} | 限定 | 3 天 | 100 额度 |

## 保险箱加成

提升保险箱负重上限的方法之一。小人类可以通过 **购买保险箱加成** 来进一步提升负重上限，以容纳更多道具。

### 购买加成教程

1. 点击保险箱页面的 **🆙{blue}加成{}** 按钮。

    ![点击加成按钮](/img/backpack/buy_boost_step1.png){.hm-center-img width="500"}

2. 点击 **{blue}保险箱加成{}**。

    ![点击保险箱加成](/img/backpack/buy_boost_step2.png){.hm-center-img width="500"}

3. 进入加成详情页面，如图所示。

    ![加成详情示意 A](/img/backpack/buy_boost_step3_a.png){.hm-right-img width="350"}![加成详情示意 B](/img/backpack/buy_boost_step3_b.png){.hm-left-img width="350"}

4. 按需购买加成即可。

    ![选择要购买的加成档位](/img/backpack/buy_boost_step4.png){.hm-center-img width="500"}

5. 这里以第一个按钮为示例，可以看到额度充足，购买成功。

    ![购买成功示例](/img/backpack/buy_boost_step5.png){.hm-center-img width="500"}

6. 可以看到负重提升了。

    ![购买前的负重](/img/backpack/buy_boost_step6_before.png){.hm-right-img width="320"}![购买后的负重](/img/backpack/buy_boost_step6_after.png){.hm-left-img width="320"}

### 不同加成计算公式

#### ⚙️ 内部容量加成

> {blue}每级使基础负重 +1%，上限 100 级。{}

每等级 **购买价格** 计算公式如下：

$$
Cost = round((level + 1)^{1.64}, 2)
$$

如小人类该加成等级是 5 级，要升级到 6 级，需要耗费：

$$
(5 + 1)^{1.64} = 18.8872205...
$$

然后保留两位小数（四舍五入）：

$$
round(18.887220503618..., 2) = 18.89
$$

即小人类从 5 级升到 6 级，需要消耗 **18.89** 额度。

每等级给予的 **负重加成** 计算公式如下：

$$
NewLimit = Limit \times (1 + 0.01 \times level)
$$

假设小人类该加成是 5 级，且背包基础负重为 1000，则有：

$$
NewLimit = 1000 \times (1 + 0.01 \times 5) = 1050
$$

计算后，小人类的新负重为 **1050**，相比原负重增加了 **5%**。

## 背包权益

保险箱的容量上限决定着小人类当前的背包等级能够容纳多少额度，以及装下多少道具。{blue}背包等级越高，能持有的额度越多，能装下的道具越多。{}

此外，背包等级越高，能在幻梦这里享受到的权益就越多，小人类可以点击下方卡片跳转到子页面查看详细的等级特权列表。

<div class="app-card-grid">
    <div class="app-card">
        <div class="app-card-left">
            <div class="app-card-avatar emoji-avatar">🎒</div>
            <div class="app-card-info">
                <div class="app-card-title">背包等级特权</div>
                <div class="app-card-desc">查看不同背包等级解锁的权益与额度上限。</div>
            </div>
        </div>
        <a href="/docs/entertainment/backpack/level" class="app-action-btn">前往查看</a>
    </div>
</div>
